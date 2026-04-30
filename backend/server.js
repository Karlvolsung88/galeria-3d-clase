require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Resend } = require("resend");

// =====================================================================
// Storage abstraction (v3.3.0 — feature Marmoset Showcase).
// En PROD subimos a DigitalOcean Spaces (S3-compatible).
// En DEV local guardamos en filesystem (`backend/uploads/`) y servimos
// vía middleware `/cdn` con fallback proxy a prod para los archivos
// que ya están en el bucket de prod (.glb/.thumb originales de estudiantes).
// Esto garantiza que el bucket de prod NUNCA reciba uploads desde local.
// =====================================================================
const IS_DEV = process.env.NODE_ENV !== "production";
const LOCAL_UPLOADS_DIR = path.join(__dirname, "uploads");

if (IS_DEV) {
  fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
  console.log(`[storage] DEV mode — uploads → ${LOCAL_UPLOADS_DIR}`);
}

/**
 * Extrae el thumbnail JPG embebido en un archivo .mview.
 *
 * Marmoset Toolbag al exportar viewer guarda automáticamente un poster
 * JPG como primer asset del container. El formato .mview es propietario
 * binario simple; el primer JPG está siempre en los primeros 256 bytes
 * después del header (filename + mimetype + size).
 *
 * Estrategia robusta: buscar magic numbers JPEG en lugar de parsear el
 * header — funciona aunque Marmoset cambie el formato del header en
 * versiones futuras, mientras siga embebiendo un JPG inicial.
 *
 * @param {Buffer} buffer  Buffer completo del archivo .mview
 * @returns {Buffer|null}  Buffer del JPG extraído, o null si no se encontró
 */
function extractMviewThumbnail(buffer) {
  const JPG_START = Buffer.from([0xFF, 0xD8, 0xFF]);
  const JPG_END = Buffer.from([0xFF, 0xD9]);
  const start = buffer.indexOf(JPG_START);
  if (start < 0 || start > 256) return null;
  const end = buffer.indexOf(JPG_END, start);
  if (end < 0) return null;
  return buffer.slice(start, end + 2);
}

/**
 * Sube un asset al storage configurado (Spaces en prod, filesystem en dev).
 * En dev además garantiza que el directorio padre exista.
 */
async function putAsset(key, body, contentType) {
  if (IS_DEV) {
    const filepath = path.join(LOCAL_UPLOADS_DIR, key);
    await fs.promises.mkdir(path.dirname(filepath), { recursive: true });
    await fs.promises.writeFile(filepath, body);
    return;
  }
  await s3.send(new PutObjectCommand({
    Bucket: process.env.SPACES_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    ACL: "public-read",
  }));
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const app = express();
app.use(cors());
app.use(express.json());

// =====================================================================
// DEV-ONLY: middleware `/cdn` con fallback proxy a Spaces de prod.
// Archivos subidos LOCALMENTE viven en `backend/uploads/` y se sirven
// directos. Si la request es por un archivo que NO existe local
// (ej. .glb originales de estudiantes que ya están en bucket prod),
// hacemos proxy a https://ceopacademia.org/cdn/* para que la galería
// se vea completa en local sin replicar todo el bucket.
//
// En prod este middleware no se monta — nginx sirve `/cdn` directamente
// desde el bucket de DigitalOcean Spaces (config en sites-available/galeria).
// =====================================================================
if (IS_DEV) {
  app.use("/cdn", async (req, res) => {
    const safePath = path.normalize(req.path).replace(/^[/\\]+/, "");
    if (safePath.includes("..")) return res.status(400).end();
    const localPath = path.join(LOCAL_UPLOADS_DIR, safePath);

    // 1) Servir desde filesystem si existe localmente
    try {
      await fs.promises.access(localPath, fs.constants.R_OK);
      return res.sendFile(localPath);
    } catch { /* no existe local — caer al fallback */ }

    // 2) Fallback: proxy a CDN de prod
    try {
      const upstreamUrl = `https://ceopacademia.org/cdn/${safePath}`;
      const upstream = await fetch(upstreamUrl);
      if (!upstream.ok) return res.status(upstream.status).end();
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      const cl = upstream.headers.get("content-length");
      if (cl) res.setHeader("Content-Length", cl);
      const buffer = Buffer.from(await upstream.arrayBuffer());
      return res.send(buffer);
    } catch (err) {
      console.error("[cdn fallback]", err.message);
      return res.status(502).end();
    }
  });
  console.log("[storage] DEV /cdn middleware activo (filesystem + fallback prod)");
}

// --- Database ---
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
});

// --- S3 (DO Spaces) ---
const s3 = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION,
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
  forcePathStyle: false,
});

// File filter — formatos aceptados según el campo del FormData.
//   field "file":      modelos 3D del flujo principal (.glb, .gltf, .mview)
//   field "mview":     archivo .mview del flujo Showcase (enrichment v3.3.0)
//   field "thumbnail": imágenes (cualquier image/*)
// Tamaño máximo: 100 MB (cubre .mview con texturas embedded HD).
const ALLOWED_MODEL_EXT = /\.(glb|gltf|mview)$/i;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "file") {
      if (ALLOWED_MODEL_EXT.test(file.originalname)) return cb(null, true);
      return cb(new Error("Formato no soportado. Usa .glb, .gltf o .mview"));
    }
    if (file.fieldname === "mview") {
      if (/\.mview$/i.test(file.originalname)) return cb(null, true);
      return cb(new Error("El archivo Showcase debe ser .mview"));
    }
    if (file.fieldname === "thumbnail") {
      if (file.mimetype.startsWith("image/")) return cb(null, true);
      return cb(new Error("La portada debe ser una imagen"));
    }
    return cb(new Error(`Campo desconocido: ${file.fieldname}`));
  },
});

// ============================================================
// --- RBAC Helpers ---
// ============================================================

/**
 * Carga los roles del usuario desde user_roles.
 * Fallback: si user_roles está vacío (migración parcial), usa profiles.role.
 */
async function getUserRoles(userId) {
  const { rows } = await pool.query(
    `SELECT r.name FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );
  if (rows.length) return rows.map(r => r.name);
  // Fallback (edge case durante migración soft)
  const { rows: fb } = await pool.query("SELECT role FROM profiles WHERE id = $1", [userId]);
  return fb.length && fb[0].role ? [fb[0].role] : [];
}

/**
 * Rol "principal" para compatibilidad con frontend legacy que espera user.role (string).
 * Prioridad: admin > teacher > student.
 */
function primaryRole(roles) {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("teacher")) return "teacher";
  if (roles.includes("student")) return "student";
  return roles[0] || null;
}

/**
 * ¿El teacher tiene asignado a este student?
 */
async function isTeacherOf(teacherId, studentId) {
  const { rows } = await pool.query(
    "SELECT 1 FROM teacher_students WHERE teacher_id = $1 AND student_id = $2",
    [teacherId, studentId]
  );
  return rows.length > 0;
}

/**
 * Usuario actual tiene alguno de los roles permitidos.
 */
function hasAnyRole(req, ...allowed) {
  const userRoles = req.user?.roles || (req.user?.role ? [req.user.role] : []);
  return userRoles.some(r => allowed.includes(r));
}

// ============================================================
// --- Password utils ---
// ============================================================

/**
 * Genera una password temporal legible para uso administrativo (Plan C).
 * Formato: XXXX-XXXX-XXXX (12 chars + 2 guiones).
 * Alfabeto sin caracteres ambiguos (sin O/0, l/1, I) — reduce errores al
 * copiar/tipear la password desde un mensaje de Teams.
 *
 * Entropía: ~70 bits (55^12) — suficiente para password de corta vida que el
 * estudiante debe cambiar en su primer login (must_change_password=true).
 *
 * Usa crypto.randomBytes (CSPRNG), NO Math.random.
 */
function generateSecurePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  let raw = "";
  for (let i = 0; i < 12; i++) raw += alphabet[bytes[i] % alphabet.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

// ============================================================
// --- Auth Middlewares ---
// ============================================================

function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: "Token invalido" }); }
}

/**
 * Middleware factory — requiere que el usuario tenga AL MENOS uno de los roles listados.
 * Uso: app.post("/api/admin/...", auth, requireRole("admin"), handler)
 */
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Auth requerida" });
    if (!hasAnyRole(req, ...allowed)) {
      return res.status(403).json({ error: `Rol requerido: ${allowed.join(" o ")}` });
    }
    next();
  };
}

// ============================================================
// --- AUTH ROUTES ---
// ============================================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password || !full_name) return res.status(400).json({ error: "Campos requeridos" });
    if (password.length < 6) return res.status(400).json({ error: "Minimo 6 caracteres" });

    // Validación de dominio institucional (redundante con CHECK de DB, pero mejor mensaje)
    if (!/^[^@]+@unbosque\.edu\.co$/.test(email)) {
      return res.status(400).json({ error: "Solo se permiten correos @unbosque.edu.co" });
    }

    const exists = await pool.query("SELECT id FROM profiles WHERE email = $1", [email]);
    if (exists.rows.length) return res.status(409).json({ error: "Email ya registrado" });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO profiles (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, full_name, email",
      [full_name, email, hash, "student"]
    );
    const user = rows[0];

    // Asignar rol 'student' en user_roles (el assigned_by queda NULL — autoregistro)
    await pool.query(
      "INSERT INTO user_roles (user_id, role_id) VALUES ($1, 3)",
      [user.id]
    );

    const roles = ["student"];
    const token = jwt.sign(
      { id: user.id, roles, role: primaryRole(roles), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, user: { ...user, roles, role: primaryRole(roles) } });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query("SELECT * FROM profiles WHERE email = $1", [email]);
    if (!rows.length) return res.status(401).json({ error: "Credenciales incorrectas" });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Credenciales incorrectas" });

    const roles = await getUserRoles(user.id);
    const token = jwt.sign(
      { id: user.id, roles, role: primaryRole(roles), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        roles,
        role: primaryRole(roles),
        email: user.email,
        must_change_password: user.must_change_password === true,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, full_name, email, artstation_url, instagram_url, bio, created_at, must_change_password FROM profiles WHERE id = $1",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
    const roles = await getUserRoles(req.user.id);
    const profile = rows[0];
    res.json({
      ...profile,
      roles,
      role: primaryRole(roles),
      must_change_password: profile.must_change_password === true,
    });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

// ============================================================
// --- PASSWORD RESET ---
// ============================================================

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Solicitar reset de password.
 * Responde 200 SIEMPRE (no revelar si el email existe → previene enumeration).
 * Si el email sí existe: genera token (32 bytes hex, guarda solo SHA-256 en DB)
 * y envía email vía Resend con link {APP_URL}/reset-password?token=...
 */
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email requerido" });

    const { rows } = await pool.query(
      "SELECT id, full_name, email FROM profiles WHERE email = $1",
      [email]
    );

    // Respuesta genérica para evitar enumeration — siempre 200
    const ok = { ok: true, message: "Si el correo existe, recibirás un enlace para restablecer tu contraseña." };

    if (!rows.length) {
      return res.json(ok);
    }

    const user = rows[0];

    // Generar token crudo y hash SHA-256
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        tokenHash,
        expiresAt,
        (req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "").toString().slice(0, 64),
        (req.headers["user-agent"] || "").toString().slice(0, 255),
      ]
    );

    const appUrl = process.env.APP_URL || "http://localhost:5173";
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    // Envío del email — si Resend no está configurado, logueamos el link (dev)
    if (!resend) {
      console.log(`[RESET DEV] Link para ${email}: ${resetUrl}`);
      return res.json(ok);
    }

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM || "Galeria 3D <onboarding@resend.dev>",
        to: user.email,
        subject: "Restablece tu contraseña — Galería 3D",
        html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Restablece tu contraseña</title>
</head>
<body style="margin:0; padding:0; background:#f5f5f5;">
  <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1a1a1a; background:#ffffff;">
    <h2 style="color: #0891b2;">Restablece tu contraseña</h2>
    <p>Hola ${user.full_name},</p>
    <p>Alguien (esperamos que tú) solicitó restablecer la contraseña de tu cuenta en la Galería 3D.</p>
    <p>Para continuar, haz clic en el siguiente botón. El enlace expira en <strong>1 hora</strong>.</p>
    <p style="margin: 28px 0;">
      <a href="${resetUrl}" style="background: #0891b2; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Restablecer contraseña
      </a>
    </p>
    <p style="color: #666; font-size: 13px;">O copia este enlace en tu navegador:<br/><code style="font-size: 12px;">${resetUrl}</code></p>
    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
    <p style="color: #999; font-size: 12px;">Si tú no hiciste esta solicitud, ignora este correo. Nadie podrá acceder a tu cuenta sin hacer clic en el enlace.</p>
    <p style="color: #999; font-size: 12px;">— Estudio de Creación Digital · CEOPAcademia</p>
  </div>
</body>
</html>`,
      });
    } catch (mailErr) {
      console.error("Resend error:", mailErr);
      // NO revelamos el error al cliente → siempre 200 igual
    }

    res.json(ok);
  } catch (err) {
    console.error("Forgot-password error:", err);
    // Incluso ante error interno mantenemos la respuesta genérica
    res.json({ ok: true, message: "Si el correo existe, recibirás un enlace para restablecer tu contraseña." });
  }
});

/**
 * Reset de password con token.
 * Verifica: hash coincide, no expirado, no usado. Si todo OK, actualiza password y marca used_at.
 */
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ error: "Token y nueva contraseña requeridos" });
    if (typeof new_password !== "string" || new_password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const { rows } = await pool.query(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (!rows.length) return res.status(400).json({ error: "Token inválido" });

    const t = rows[0];
    if (t.used_at) return res.status(400).json({ error: "Token ya utilizado" });
    if (new Date(t.expires_at) < new Date()) return res.status(400).json({ error: "Token expirado" });

    const newHash = await bcrypt.hash(new_password, 10);

    // Actualizar password + marcar token usado en una transacción
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE profiles SET password_hash = $1 WHERE id = $2", [newHash, t.user_id]);
      await client.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [t.id]);
      // Invalidar cualquier otro token vigente del mismo usuario (por seguridad)
      await client.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL AND id <> $2`,
        [t.user_id, t.id]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    res.json({ ok: true, message: "Contraseña actualizada" });
  } catch (err) {
    console.error("Reset-password error:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

/**
 * Cambio de password por el propio usuario autenticado.
 * Verifica current_password para prevenir hijack con un token robado.
 * Al completarse limpia must_change_password=false (Plan C flow).
 * Body: { current_password, new_password }
 */
app.post("/api/auth/change-password", auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: "current_password y new_password son requeridos" });
    }
    if (typeof new_password !== "string" || new_password.length < 6) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
    }

    const { rows } = await pool.query(
      "SELECT id, password_hash FROM profiles WHERE id = $1",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
    const user = rows[0];

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Contraseña actual incorrecta" });

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query(
      "UPDATE profiles SET password_hash = $1, must_change_password = false WHERE id = $2",
      [newHash, user.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Change-password error:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// ============================================================
// --- MODELS ROUTES ---
// ============================================================

app.get("/api/models", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM models ORDER BY sort_order ASC, created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error("Models error:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

app.post("/api/models", auth, upload.fields([{ name: "file", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]), async (req, res) => {
  try {
    const { title, student, category, description, tags } = req.body;
    const file = req.files?.file?.[0];
    if (!file) return res.status(400).json({ error: "Archivo requerido" });

    // RBAC para .mview: solo docentes (admin / teacher) pueden subir Showcase.
    // Los .glb/.gltf siguen abiertos a cualquier usuario autenticado (estudiantes incluidos).
    const isMview = /\.mview$/i.test(file.originalname);
    if (isMview && !hasAnyRole(req, "admin", "teacher")) {
      return res.status(403).json({ error: "Solo docentes pueden subir modelos .mview (Showcase)" });
    }

    const timestamp = Date.now();
    const fileKey = `models/${timestamp}-${file.originalname}`;

    await putAsset(
      fileKey,
      file.buffer,
      // .mview no tiene mimetype estándar — usar octet-stream binario.
      isMview ? "application/octet-stream" : file.mimetype
    );

    const file_url = `/cdn/${fileKey}`;
    let thumbnail_url = null;

    const thumb = req.files?.thumbnail?.[0];
    if (thumb) {
      // Para .glb el thumb se genera client-side como WebP (ThumbnailCapture).
      // Para .mview el docente sube imagen manual (PNG/JPG) — preservar extensión.
      const thumbExt = isMview ? (thumb.originalname.match(/\.(png|jpg|jpeg|webp)$/i)?.[0] || ".png") : ".webp";
      const thumbKey = `thumbnails/${timestamp}-thumb${thumbExt}`;
      await putAsset(thumbKey, thumb.buffer, isMview ? thumb.mimetype : "image/webp");
      thumbnail_url = `/cdn/${thumbKey}`;
    } else if (isMview) {
      // Sin thumbnail manual y es .mview → extraer el JPG embebido por Marmoset Toolbag.
      const embedded = extractMviewThumbnail(file.buffer);
      if (embedded) {
        const thumbKey = `thumbnails/${timestamp}-thumb.jpg`;
        await putAsset(thumbKey, embedded, "image/jpeg");
        thumbnail_url = `/cdn/${thumbKey}`;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO models (title, student, category, description, tags, file_name, file_url, file_size, thumbnail_url, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [title, student, category, description || "", tags ? JSON.parse(tags) : [], file.originalname, file_url, file.size, thumbnail_url, req.user.id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Upload error:", err);
    // Errores del fileFilter de multer llegan acá con err.message útil
    const msg = err?.message?.startsWith("Formato") || err?.message?.startsWith("La portada")
      ? err.message
      : "Error al subir modelo";
    res.status(500).json({ error: msg });
  }
});

// ============================================================
// --- SHOWCASE (.mview) — feature v3.3.0 ---
// ============================================================
// Enriquece un modelo existente con su versión Marmoset Toolbag (.mview).
// Solo docentes (admin/teacher) pueden agregar Showcase.
// El frontend mostrará un carrusel para alternar entre .glb (estudiante) y .mview.
// IMPORTANTE: declarar ANTES de PUT /api/models/:id para que Express enrute correctamente.
app.post(
  "/api/models/:id/showcase",
  auth,
  requireRole("admin", "teacher"),
  upload.fields([
    { name: "mview", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const mview = req.files?.mview?.[0];
      const thumbnail = req.files?.thumbnail?.[0];

      if (!mview) return res.status(400).json({ error: "Archivo .mview requerido" });
      // Thumbnail es OPCIONAL — Marmoset Toolbag puede incluir poster embebido
      // en el .mview, y el frontend tiene fallback al thumbnail del .glb del estudiante.

      // Verificar que el modelo existe (FK implícita)
      const { rows: existing } = await pool.query("SELECT id, title FROM models WHERE id = $1", [id]);
      if (existing.length === 0) return res.status(404).json({ error: "Modelo no encontrado" });

      const timestamp = Date.now();
      const mviewKey = `models/${timestamp}-${mview.originalname}`;

      // Uploads paralelos: .mview siempre, thumbnail con prioridad
      //   1) imagen manual subida por el docente (override explícito)
      //   2) thumbnail JPG embebido en el .mview (Marmoset Toolbag lo genera al exportar)
      //   3) null (frontend cae al fallback del .glb / placeholder "M")
      const uploads = [putAsset(mviewKey, mview.buffer, "application/octet-stream")];

      let mview_thumbnail_url = null;
      if (thumbnail) {
        // Prioridad 1: override manual del docente
        const thumbExt = thumbnail.originalname.match(/\.(png|jpg|jpeg|webp)$/i)?.[0] || ".png";
        const thumbKey = `thumbnails/${timestamp}-showcase${thumbExt}`;
        uploads.push(putAsset(thumbKey, thumbnail.buffer, thumbnail.mimetype));
        mview_thumbnail_url = `/cdn/${thumbKey}`;
      } else {
        // Prioridad 2: extraer el JPG embebido del propio .mview
        const embedded = extractMviewThumbnail(mview.buffer);
        if (embedded) {
          const thumbKey = `thumbnails/${timestamp}-showcase.jpg`;
          uploads.push(putAsset(thumbKey, embedded, "image/jpeg"));
          mview_thumbnail_url = `/cdn/${thumbKey}`;
        }
      }

      await Promise.all(uploads);

      const mview_url = `/cdn/${mviewKey}`;

      const { rows } = await pool.query(
        `UPDATE models
            SET mview_url = $1, mview_thumbnail_url = $2
          WHERE id = $3
        RETURNING *`,
        [mview_url, mview_thumbnail_url, id]
      );

      res.json(rows[0]);
    } catch (err) {
      console.error("Showcase upload error:", err);
      const msg =
        err?.message?.startsWith("El archivo Showcase") ||
        err?.message?.startsWith("La portada")
          ? err.message
          : "Error al subir Showcase";
      res.status(500).json({ error: msg });
    }
  }
);

// Quitar el Showcase (no borra el .glb del estudiante, solo limpia las columnas mview_*).
// Útil si el docente quiere reemplazar la versión Marmoset con otra subiendo de nuevo.
// Nota: NO borramos el archivo .mview del bucket (estrategia "soft delete" — es trivial
// limpiar archivos huérfanos con un script administrativo si se vuelve necesario).
app.delete("/api/models/:id/showcase", auth, requireRole("admin", "teacher"), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE models
          SET mview_url = NULL, mview_thumbnail_url = NULL
        WHERE id = $1
      RETURNING *`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Modelo no encontrado" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Showcase delete error:", err);
    res.status(500).json({ error: "Error al quitar Showcase" });
  }
});

// Reemplazar archivo .glb del modelo del estudiante (v3.3.0).
// Solo admin/teacher pueden reemplazar archivos. El modelo se mantiene
// (mismo id, mismos likes/comentarios/showcase) — solo cambia el binario.
// IMPORTANTE: declarar ANTES de PUT /api/models/:id para que Express no
// lo confunda con un :id literal "file".
app.put(
  "/api/models/:id/file",
  auth,
  requireRole("admin", "teacher"),
  upload.single("file"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const file = req.file;
      if (!file) return res.status(400).json({ error: "Archivo requerido" });

      // Verificar que el modelo existe
      const { rows: existing } = await pool.query(
        "SELECT id, file_url FROM models WHERE id = $1",
        [id]
      );
      if (existing.length === 0) return res.status(404).json({ error: "Modelo no encontrado" });

      // Detectar tipo y aplicar mismo content-type que en POST /api/models
      const isMview = /\.mview$/i.test(file.originalname);
      const timestamp = Date.now();
      const fileKey = `models/${timestamp}-${file.originalname}`;

      await putAsset(
        fileKey,
        file.buffer,
        isMview ? "application/octet-stream" : file.mimetype
      );

      const file_url = `/cdn/${fileKey}`;
      const { rows } = await pool.query(
        `UPDATE models
            SET file_url = $1, file_name = $2, file_size = $3
          WHERE id = $4
        RETURNING *`,
        [file_url, file.originalname, file.size, id]
      );

      res.json(rows[0]);
    } catch (err) {
      console.error("Replace file error:", err);
      const msg = err?.message?.startsWith("Formato") ? err.message : "Error al reemplazar archivo";
      res.status(500).json({ error: msg });
    }
  }
);

// Reorder — SOLO admin (orden global de la galería)
// IMPORTANTE: declarar ANTES de PUT /api/models/:id para que Express no lo capture como :id="reorder"
app.put("/api/models/reorder", auth, requireRole("admin"), async (req, res) => {
  try {
    const { updates } = req.body;
    for (const { id, sort_order } of updates) {
      await pool.query("UPDATE models SET sort_order = $1 WHERE id = $2", [sort_order, id]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

// PUT model — owner OR admin OR teacher-del-owner
app.put("/api/models/:id", auth, async (req, res) => {
  try {
    const { rows: modelRows } = await pool.query("SELECT user_id FROM models WHERE id = $1", [req.params.id]);
    if (!modelRows.length) return res.status(404).json({ error: "Modelo no encontrado" });
    const ownerId = modelRows[0].user_id;

    const isOwner = ownerId === req.user.id;
    const isAdmin = hasAnyRole(req, "admin");
    const isTeacher = hasAnyRole(req, "teacher") && (await isTeacherOf(req.user.id, ownerId));

    if (!isOwner && !isAdmin && !isTeacher) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const { title, student, category, description, tags } = req.body;
    const { rows } = await pool.query(
      `UPDATE models SET title=$1, student=$2, category=$3, description=$4, tags=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [title, student, category, description, tags, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("Update model error:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// DELETE model — admin OR teacher-del-owner
app.delete("/api/models/:id", auth, async (req, res) => {
  try {
    const { rows: modelRows } = await pool.query("SELECT user_id FROM models WHERE id = $1", [req.params.id]);
    if (!modelRows.length) return res.status(404).json({ error: "Modelo no encontrado" });
    const ownerId = modelRows[0].user_id;

    const isAdmin = hasAnyRole(req, "admin");
    const isTeacher = hasAnyRole(req, "teacher") && (await isTeacherOf(req.user.id, ownerId));

    if (!isAdmin && !isTeacher) {
      return res.status(403).json({ error: "No autorizado" });
    }

    await pool.query("DELETE FROM likes WHERE model_id = $1", [req.params.id]);
    await pool.query("DELETE FROM comments WHERE model_id = $1", [req.params.id]);
    await pool.query("DELETE FROM models WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

// ============================================================
// --- PROFILES ROUTES ---
// ============================================================

// Listado de students — ahora via user_roles
app.get("/api/profiles/students", async (req, res) => {
  try {
    const { rows: students } = await pool.query(
      `SELECT DISTINCT p.id, p.full_name, p.artstation_url, p.instagram_url, p.bio
       FROM profiles p
       JOIN user_roles ur ON ur.user_id = p.id
       WHERE ur.role_id = 3
       ORDER BY p.full_name`
    );
    for (const s of students) {
      const { rows: skills } = await pool.query(
        "SELECT skill_name, value FROM student_skills WHERE user_id = $1",
        [s.id]
      );
      s.student_skills = skills;
    }
    res.json(students);
  } catch (err) {
    console.error("Students list error:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// PUT profile — self OR admin OR teacher-del-owner
app.put("/api/profiles/:id", auth, async (req, res) => {
  try {
    const isSelf = req.user.id === req.params.id;
    const isAdmin = hasAnyRole(req, "admin");
    const isTeacher = hasAnyRole(req, "teacher") && (await isTeacherOf(req.user.id, req.params.id));

    if (!isSelf && !isAdmin && !isTeacher) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const { full_name, bio, artstation_url, instagram_url } = req.body;
    const { rows } = await pool.query(
      "UPDATE profiles SET full_name=COALESCE($1,full_name), bio=$2, artstation_url=$3, instagram_url=$4 WHERE id=$5 RETURNING *",
      [full_name, bio, artstation_url, instagram_url, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

// DELETE profile — admin only (acción destructiva)
app.delete("/api/profiles/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM student_skills WHERE user_id = $1", [req.params.id]);
    await pool.query("DELETE FROM likes WHERE user_id = $1", [req.params.id]);
    await pool.query("DELETE FROM comments WHERE user_id = $1", [req.params.id]);
    await pool.query("DELETE FROM models WHERE user_id = $1", [req.params.id]);
    // user_roles y teacher_students se limpian por ON DELETE CASCADE
    await pool.query("DELETE FROM profiles WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

// ============================================================
// --- LIKES ROUTES ---
// ============================================================

app.get("/api/likes/counts", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT model_id, COUNT(*)::int as count FROM likes GROUP BY model_id");
    const counts = {};
    rows.forEach(r => counts[r.model_id] = r.count);
    res.json(counts);
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

app.get("/api/likes/user", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT model_id FROM likes WHERE user_id = $1", [req.user.id]);
    res.json(rows.map(r => r.model_id));
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

app.post("/api/likes/toggle", auth, async (req, res) => {
  try {
    const { model_id } = req.body;
    const existing = await pool.query("SELECT id FROM likes WHERE user_id=$1 AND model_id=$2", [req.user.id, model_id]);
    if (existing.rows.length) {
      await pool.query("DELETE FROM likes WHERE user_id=$1 AND model_id=$2", [req.user.id, model_id]);
      res.json({ liked: false });
    } else {
      await pool.query("INSERT INTO likes (user_id, model_id) VALUES ($1, $2)", [req.user.id, model_id]);
      res.json({ liked: true });
    }
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

// ============================================================
// --- COMMENTS ROUTES ---
// ============================================================

app.get("/api/comments/:modelId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, p.full_name, p.role FROM comments c
       JOIN profiles p ON p.id = c.user_id
       WHERE c.model_id = $1 ORDER BY c.created_at ASC`,
      [req.params.modelId]
    );
    res.json(rows.map(r => ({ ...r, profiles: { full_name: r.full_name, role: r.role } })));
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

app.post("/api/comments", auth, async (req, res) => {
  try {
    const { model_id, text } = req.body;
    const { rows } = await pool.query(
      "INSERT INTO comments (user_id, model_id, text) VALUES ($1, $2, $3) RETURNING *",
      [req.user.id, model_id, text]
    );
    const { rows: profile } = await pool.query("SELECT full_name, role FROM profiles WHERE id=$1", [req.user.id]);
    res.json({ ...rows[0], profiles: profile[0] });
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

// DELETE comment — author OR admin
app.delete("/api/comments/:id", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT user_id FROM comments WHERE id=$1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "No encontrado" });
    const isAuthor = rows[0].user_id === req.user.id;
    const isAdmin = hasAnyRole(req, "admin");
    if (!isAuthor && !isAdmin) return res.status(403).json({ error: "No autorizado" });
    await pool.query("DELETE FROM comments WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

// ============================================================
// --- SKILLS ROUTES ---
// ============================================================

app.get("/api/skills/:userId", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT skill_name, value FROM student_skills WHERE user_id=$1", [req.params.userId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

// PUT skills — self OR admin OR teacher-del-owner
app.put("/api/skills/:userId", auth, async (req, res) => {
  try {
    const isSelf = req.user.id === req.params.userId;
    const isAdmin = hasAnyRole(req, "admin");
    const isTeacher = hasAnyRole(req, "teacher") && (await isTeacherOf(req.user.id, req.params.userId));

    if (!isSelf && !isAdmin && !isTeacher) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const { skills } = req.body;
    for (const { skill_name, value } of skills) {
      await pool.query(
        `INSERT INTO student_skills (user_id, skill_name, value, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, skill_name) DO UPDATE SET value=$3, updated_at=NOW()`,
        [req.params.userId, skill_name, value]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

app.delete("/api/skills/:userId", auth, requireRole("admin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM student_skills WHERE user_id=$1", [req.params.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

// ============================================================
// --- COMMENT COUNTS ---
// ============================================================

app.get("/api/comments-counts", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT model_id, COUNT(*)::int as count FROM comments GROUP BY model_id");
    const counts = {};
    rows.forEach(r => counts[r.model_id] = r.count);
    res.json(counts);
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

// ============================================================
// --- THUMBNAIL UPLOAD ---
// ============================================================

app.put("/api/models/:id/thumbnail", auth, upload.single("thumbnail"), async (req, res) => {
  try {
    const thumb = req.file;
    if (!thumb) return res.status(400).json({ error: "Thumbnail requerido" });

    const thumbKey = `thumbnails/${Date.now()}-${req.params.id}.webp`;
    await putAsset(thumbKey, thumb.buffer, "image/webp");

    const thumbnail_url = `/cdn/${thumbKey}`;
    await pool.query("UPDATE models SET thumbnail_url=$1 WHERE id=$2", [thumbnail_url, req.params.id]);
    res.json({ thumbnail_url });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

// ============================================================
// --- ADMIN ROUTES (gestión de roles y usuarios) ---
// ============================================================

/**
 * Crear usuario nuevo con password temporal generada (Plan C).
 * Body: { email, full_name, role } donde role ∈ {student, teacher, admin}
 * Response (201): { user, temp_password }
 *
 * IMPORTANTE: temp_password se devuelve UNA VEZ aquí. El frontend debe
 * mostrarla al admin para que la copie y la envíe por Teams al estudiante.
 * No se guarda en claro en ningún otro lugar.
 */
app.post("/api/admin/users", auth, requireRole("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, full_name, role } = req.body;
    if (!email || !full_name || !role) {
      return res.status(400).json({ error: "email, full_name y role son requeridos" });
    }
    if (!["student", "teacher", "admin"].includes(role)) {
      return res.status(400).json({ error: "role inválido" });
    }
    // Validación de dominio — mejor mensaje que dejar que la DB tire el CHECK
    if (!/^[^@]+@(unbosque\.edu\.co|ceopacademia\.org)$/.test(email)) {
      return res.status(400).json({ error: "Solo se permiten correos @unbosque.edu.co o @ceopacademia.org" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const tempPassword = generateSecurePassword();
    const hash = await bcrypt.hash(tempPassword, 10);

    await client.query("BEGIN");

    // 1) Insertar profile con flag forzado
    // NOTA: profiles.role solo acepta {admin, student} por CHECK heredado.
    // Para teachers, guardamos 'student' como rol principal en profiles.role
    // y confiamos en user_roles (RBAC multi-rol) como fuente de verdad.
    const profileRole = role === "teacher" ? "student" : role;
    const { rows: [newUser] } = await client.query(
      `INSERT INTO profiles (full_name, email, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, full_name, email, role`,
      [full_name.trim(), normalizedEmail, hash, profileRole]
    );

    // 2) Asignar role en tabla pivote user_roles (consistencia RBAC multi-rol)
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by)
       SELECT $1, id, $2 FROM roles WHERE name = $3`,
      [newUser.id, req.user.id, role]
    );

    await client.query("COMMIT");

    console.log(`[ADMIN] ${req.user.email} creó usuario ${newUser.email} (${role})`);

    res.status(201).json({
      user: { ...newUser, role, roles: [role] },
      temp_password: tempPassword,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(409).json({ error: "El email ya está registrado" });
    }
    console.error("Admin create user error:", err);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

/**
 * Reset manual de password — el admin genera una nueva password temporal
 * para un usuario existente (Plan C flow). Marca must_change_password=true
 * para que el usuario deba cambiarla en su próximo login.
 * Invalida además cualquier token de reset self-service pendiente.
 * Response (200): { temp_password }
 */
app.post("/api/admin/users/:id/reset-password", auth, requireRole("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.params.id;

    const { rows } = await client.query(
      "SELECT id, email FROM profiles WHERE id = $1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
    const user = rows[0];

    const tempPassword = generateSecurePassword();
    const hash = await bcrypt.hash(tempPassword, 10);

    await client.query("BEGIN");

    await client.query(
      "UPDATE profiles SET password_hash = $1, must_change_password = true WHERE id = $2",
      [hash, userId]
    );

    // Invalidar tokens de reset self-service pendientes (higiene)
    await client.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
      [userId]
    );

    await client.query("COMMIT");

    console.log(`[ADMIN] ${req.user.email} reseteó password de ${user.email}`);

    res.json({ temp_password: tempPassword });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Admin reset password error:", err);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

// Listar todos los usuarios con sus roles
app.get("/api/admin/users", auth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.full_name, p.email, p.created_at,
              COALESCE(array_agg(r.name ORDER BY r.id) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
       FROM profiles p
       LEFT JOIN user_roles ur ON ur.user_id = p.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY p.id
       ORDER BY p.full_name`
    );
    res.json(rows);
  } catch (err) {
    console.error("Admin users list error:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// Asignar un rol a un usuario
app.post("/api/admin/users/:id/roles", auth, requireRole("admin"), async (req, res) => {
  try {
    const { role } = req.body;
    const { rows: roleRow } = await pool.query("SELECT id FROM roles WHERE name = $1", [role]);
    if (!roleRow.length) return res.status(400).json({ error: "Rol desconocido" });

    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [req.params.id, roleRow[0].id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Assign role error:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// Quitar un rol a un usuario
app.delete("/api/admin/users/:id/roles/:role", auth, requireRole("admin"), async (req, res) => {
  try {
    const { rows: roleRow } = await pool.query("SELECT id FROM roles WHERE name = $1", [req.params.role]);
    if (!roleRow.length) return res.status(400).json({ error: "Rol desconocido" });

    // Salvaguarda: no permitir quitar el último admin del sistema
    if (req.params.role === "admin") {
      const { rows: admins } = await pool.query("SELECT count(*)::int AS c FROM user_roles WHERE role_id = 1");
      if (admins[0].c <= 1) {
        return res.status(400).json({ error: "No se puede quitar el último admin del sistema" });
      }
    }

    await pool.query("DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2", [req.params.id, roleRow[0].id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

// ============================================================
// --- TEACHER ROUTES (gestión de estudiantes) ---
// ============================================================

// Estudiantes asignados al teacher actual (o todos si es admin)
app.get("/api/teacher/students", auth, requireRole("teacher", "admin"), async (req, res) => {
  try {
    const isAdmin = hasAnyRole(req, "admin");
    let rows;
    if (isAdmin) {
      // Admin ve todos los estudiantes con su teacher (si tienen)
      ({ rows } = await pool.query(
        `SELECT p.id, p.full_name, p.email, ts.teacher_id, ts.cohort, ts.assigned_at,
                tp.full_name AS teacher_name
         FROM profiles p
         JOIN user_roles ur ON ur.user_id = p.id AND ur.role_id = 3
         LEFT JOIN teacher_students ts ON ts.student_id = p.id
         LEFT JOIN profiles tp ON tp.id = ts.teacher_id
         ORDER BY p.full_name`
      ));
    } else {
      // Teacher ve solo sus estudiantes
      ({ rows } = await pool.query(
        `SELECT p.id, p.full_name, p.email, ts.cohort, ts.assigned_at
         FROM teacher_students ts
         JOIN profiles p ON p.id = ts.student_id
         WHERE ts.teacher_id = $1
         ORDER BY p.full_name`,
        [req.user.id]
      ));
    }
    res.json(rows);
  } catch (err) {
    console.error("Teacher students error:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// Asignar estudiante a teacher (solo admin — gestiona la tabla pivote)
app.post("/api/admin/teacher-students", auth, requireRole("admin"), async (req, res) => {
  try {
    const { teacher_id, student_id, cohort } = req.body;
    if (!teacher_id || !student_id) return res.status(400).json({ error: "teacher_id y student_id requeridos" });

    // Pre-check: teacher_id debe tener rol teacher (redundante con trigger, pero mejor mensaje)
    const teacherRoles = await getUserRoles(teacher_id);
    if (!teacherRoles.includes("teacher")) {
      return res.status(400).json({ error: "El usuario destino no tiene rol teacher" });
    }

    // Pre-check: student_id debe tener rol student
    const studentRoles = await getUserRoles(student_id);
    if (!studentRoles.includes("student")) {
      return res.status(400).json({ error: "El usuario asignado no tiene rol student" });
    }

    await pool.query(
      `INSERT INTO teacher_students (teacher_id, student_id, cohort, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [teacher_id, student_id, cohort || null, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Assign student error:", err);
    // El trigger de DB también puede lanzar error si algo se escapa
    if (err.message && err.message.includes("does not have teacher role")) {
      return res.status(400).json({ error: "El usuario no tiene rol teacher" });
    }
    res.status(500).json({ error: "Error interno" });
  }
});

// Desasignar estudiante de teacher
app.delete("/api/admin/teacher-students/:teacherId/:studentId", auth, requireRole("admin"), async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM teacher_students WHERE teacher_id = $1 AND student_id = $2",
      [req.params.teacherId, req.params.studentId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error interno" });
  }
});

// ============================================================
// --- HEALTH ---
// ============================================================

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", db: "disconnected" });
  }
});

// ============================================================
// --- START ---
// ============================================================

app.listen(process.env.PORT, () => {
  console.log(`API running on port ${process.env.PORT}`);
});
