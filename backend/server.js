require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
app.use(cors());
app.use(express.json());

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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

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
      "SELECT id, full_name, email, artstation_url, instagram_url, bio, created_at FROM profiles WHERE id = $1",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
    const roles = await getUserRoles(req.user.id);
    res.json({ ...rows[0], roles, role: primaryRole(roles) });
  } catch (err) {
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

    const timestamp = Date.now();
    const fileKey = `models/${timestamp}-${file.originalname}`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: "public-read",
    }));

    const file_url = `/cdn/${fileKey}`;
    let thumbnail_url = null;

    const thumb = req.files?.thumbnail?.[0];
    if (thumb) {
      const thumbKey = `thumbnails/${timestamp}-thumb.webp`;
      await s3.send(new PutObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: thumbKey,
        Body: thumb.buffer,
        ContentType: "image/webp",
        ACL: "public-read",
      }));
      thumbnail_url = `/cdn/${thumbKey}`;
    }

    const { rows } = await pool.query(
      `INSERT INTO models (title, student, category, description, tags, file_name, file_url, file_size, thumbnail_url, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [title, student, category, description || "", tags ? JSON.parse(tags) : [], file.originalname, file_url, file.size, thumbnail_url, req.user.id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Error al subir modelo" });
  }
});

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
    await s3.send(new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: thumbKey,
      Body: thumb.buffer,
      ContentType: "image/webp",
      ACL: "public-read",
    }));

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
