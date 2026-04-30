# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

## [3.3.0] — 2026-04-30

Release minor que introduce la integración de **Marmoset Viewer** como complemento técnico de los modelos del estudiante. El docente (admin/teacher) puede asociar a cualquier modelo `.glb` su versión Marmoset Toolbag (`.mview`) — un visor de calidad técnica con materiales PBR avanzados curados manualmente. La galería muestra ambos archivos en un carrusel flip 3D donde el visitante alterna entre la vista del estudiante (XR Ready · glTF · PBR) y la vista Showcase (Marmoset · PBR).

### Agregado (feature v3.3.0 — Marmoset Showcase)

- **Migración 004** — Columnas `mview_url` y `mview_thumbnail_url` (nullable) en tabla `models`. Permite que un modelo del estudiante tenga una versión Showcase opcional en formato Marmoset Toolbag (.mview), curada por un docente. Bloque DO valida que los modelos existentes arranquen sin Showcase.
- **Backend — endpoints Showcase** — Nuevo `POST /api/models/:id/showcase` (auth + RBAC admin/teacher) que sube el .mview a DO Spaces, sube poster .png/.jpg manual, y actualiza la fila del modelo. Nuevo `DELETE /api/models/:id/showcase` que limpia las columnas (soft delete del Showcase, no borra el .glb del estudiante). Multer ahora acepta campo `mview` adicional al `file`/`thumbnail` existentes.
- **Backend — multer fileFilter + RBAC** — Validación de extensión (.glb/.gltf/.mview) en multer, y gate `requireRole(admin/teacher)` cuando se sube .mview en POST /api/models. Estudiantes solo pueden subir .glb/.gltf como antes.
- **Frontend — `MarmosetViewer.tsx`** — Componente que monta el visor oficial de Marmoset Toolbag (script `public/marmoset.js` v4.05) en un iframe aislado. Soporta modo fluido (sin width/height → `fullFrame: true` para containers responsive como modales) y modo fijo (con width/height para previews preestablecidos).
- **Frontend — `ShowcaseCarousel.tsx`** — Carrusel flip-card 3D que alterna entre la vista Marmoset (frontal, default) y la vista GLB del estudiante (trasera) con animación CSS `rotateY` 600ms. Toggle inferior con dos chips polaroid sincronizados.
- **Frontend — `ModelModal` con switch** — Si el modelo tiene `mview_url`, monta el carrusel; si no, comportamiento original con Canvas único. Lazy-loaded para no inflar el bundle de modelos sin Showcase. Placeholder de carga usa `mview_thumbnail_url` cuando hay Showcase.
- **Plan de implementación** — `docs/plans/2026-04-29-marmoset-viewer.md` con sprints, equipo (Sebastián, Isabella, Diego, Andrés, Mateo), decisiones tomadas con Carlos y restricciones de prototipado local.

### Técnico

- **Sandbox local** — `public/test-models/` agregado a `.gitignore` para aislar archivos `.mview` de prototipado del bucket de prod. Subida real a Spaces queda diferida hasta Sprint 7.
- **Ruta `/test-marmoset`** (PROTOTIPO LOCAL) — Página standalone que renderiza `MarmosetViewer` apuntando a `/test-models/Bourgelon.mview`. Marcada para eliminar antes del Sprint 7 (deploy).

### Sprint 6 — Identificación visual + Storage local

- **Tag "Marmoset Viewer"** — Reemplaza el badge sobre thumbnail (que entraba en conflicto con los botones admin) por un tag dentro de `card-tags` con cian iluminado y pulse sutil. Aparece solo cuando el modelo tiene `mview_url` (misma fuente de verdad que activa el carrusel). Visualmente coherente con tags existentes (GLB, BLENDER, PBR, etc.). Texto literal "Marmoset Viewer" como uso descriptivo del formato (no usa logo trademark — investigado con Marmoset legal/EULA).
- **Storage abstraction NODE_ENV-based** — Helper `putAsset(key, body, ct)` en backend que decide el destino: en producción sube al bucket DigitalOcean Spaces (S3-compatible), en desarrollo local guarda en `backend/uploads/`. Mismo formato de `file_url` (`/cdn/...`) en ambos entornos.
- **Middleware `/cdn` con fallback** — En dev, sirve archivos desde filesystem si existen, y si no caen a proxy contra `https://ceopacademia.org/cdn/*`. Permite ver los `.glb` ya subidos en producción sin necesidad de replicar el bucket localmente.
- **`backend/uploads/` en .gitignore** — Garantiza que el storage local nunca se commitea.
- **Auto-extracción de thumbnail del `.mview`** — Marmoset Toolbag al exportar viewer embebe automáticamente un poster JPG como primer asset. Función `extractMviewThumbnail()` busca magic numbers JPEG (FF D8 FF / FF D9) en los primeros 256 bytes del archivo y lo extrae como `image/jpeg`. Cero dependencias, 6 líneas. Ahora el docente puede subir solo el `.mview` y el sistema saca el poster solo. Si el docente sube imagen manual, esa hace override.
- **Sync prod → local de profiles + models + user_roles** — `pg_dump --data-only` desde prod (read-only sobre prod), aplicación a `galeria_3d_local`. Estrategia: passwords locales se preservan (Carlos admin + QA), nuevos profiles de prod reciben placeholder bcrypt no-funcional para que nadie pueda login con ellos en local. `vite.config.ts` proxies correctamente diferenciados (`/api` y `/cdn` ambos a localhost en dev).

### Sprint 7 — Toolbar admin en modal del modelo

- **Reemplazar `.glb`** desde el modal — endpoint `PUT /api/models/:id/file` (admin/teacher). Mantiene `id`, likes, comentarios y Showcase. Solo cambia `file_url`/`file_name`/`file_size`. UI: botón `↻` en grupo `.GLB` de la toolbar.
- **Reemplazar `.mview`** desde el modal — botón `↻` (o `+` si aún no hay) en grupo `.MVIEW` reusa `POST /api/models/:id/showcase` con auto-extract de thumbnail.
- **Quitar `.mview`** desde el modal — botón `✕` en grupo `.MVIEW`, confirm dialog, llama `DELETE /api/models/:id/showcase`. Soft delete: limpia las columnas `mview_url`/`mview_thumbnail_url` sin tocar el `.glb` del estudiante.
- **Borrar el `.glb` solo NO está soportado intencionalmente** (decisión: requeriría migración para hacer `file_url` nullable + casos edge en frontend para modelos sin `.glb`. El botón rojo de "eliminar modelo completo" en la card de la galería cubre el caso real).
- **Carousel: orden + default ajustados** — Chips reordenados: `XR Ready · glTF · PBR` primero (default activo), `Showcase · Marmoset · PBR` después. La cara default del flip 3D ahora es la del estudiante; el Showcase se elige conscientemente.
- **`PROTOTYPE_GUARD = false`** — El guard del form ya no es necesario porque el filesystem local aísla del bucket prod.

### Sprint 5 — Subida UI

- **Botón "+ Showcase" en cada card** — Visible solo para admin/teacher (RBAC multi-rol vía `isAdmin`/`isTeacher` helpers). Estados visuales: cian si el modelo aún no tiene Showcase, verde si ya lo tiene. Ícono "M" estilizada de Marmoset.
- **`ShowcaseUploadForm.tsx`** — Modal con dropzone para `.mview` y picker de imagen de portada **opcional** (Marmoset Toolbag puede embebir poster). Preview de la imagen seleccionada. Banner de modo prototipo visible mientras `PROTOTYPE_GUARD = true`.
- **`uploadShowcase()` y `removeShowcase()`** en `lib/api.ts` — wrappers del endpoint `POST/DELETE /api/models/:id/showcase`. Thumbnail opcional en signature.
- **PROTOTYPE_GUARD** — Flag que desactiva el upload real durante prototipado. Submit valida formularios y muestra alert con resumen, sin tocar el bucket de prod. Se desactiva en Sprint 7.
- **Backend `POST /api/models/:id/showcase`** — Thumbnail opcional (era required); si no se envía, `mview_thumbnail_url` queda NULL y el frontend cae al thumbnail del .glb / placeholder.

## [3.2.1] — 2026-04-15

Patch UX que elimina fricción en el formulario de subida de modelos.

### Mejorado

- **UploadForm: el campo "Nombre del estudiante" ya no se pregunta** — El endpoint `POST /api/models` ya requiere autenticación y vincula el modelo al `user_id` del usuario logueado. El campo de texto duplicaba `profiles.full_name` y obligaba a re-tipear el nombre en cada subida. Ahora se elimina del JSX y el state inicializa con `getCurrentUser()?.full_name`, manteniendo el contrato del backend (sigue recibiendo `student` en el FormData) sin cambios. Archivo: `src/components/UploadForm.tsx`.

## [3.2.0] — 2026-04-15

Release menor que completa el Plan C operativo de passwords: ahora el admin puede crear usuarios desde `/admin` con una password temporal generada automáticamente, resetearla manualmente cuando un estudiante la olvide, y el usuario es forzado a cambiarla en su primer login. Elimina la dependencia del canal email (Resend + whitelist IT) para onboarding y recuperación, dejando todo el flujo dentro del sistema.

### Agregado

- **Generación de passwords temporales desde el Panel Admin** — Nueva sección "Crear usuario" en `/admin` que permite al administrador dar de alta cualquier usuario (student / teacher / admin) con email institucional + nombre. El backend genera una password aleatoria segura (`crypto.randomBytes`, alfabeto de 55 chars sin ambiguos visuales tipo `O/0/l/1`, formato `XXXX-XXXX-XXXX`, ~70 bits de entropía) y la devuelve UNA SOLA VEZ en la respuesta. El frontend monta un modal verde prominente con botón "Copiar al portapapeles", aviso de que no se volverá a mostrar, y checkbox de confirmación explícita antes de cerrar. El admin copia la password y la comunica al usuario por Teams o presencial.
  - Archivos: `backend/server.js` (helper `generateSecurePassword()` + `POST /api/admin/users`), `src/lib/api.ts` (`adminCreateUser`), `src/components/TempPasswordModal.tsx` (nuevo), `src/components/AdminPanel.tsx` (sección UI + handler).

- **Reset manual de passwords desde el Panel Admin** — Nuevo botón "🔑 Reset" en cada fila de la tabla de usuarios. Genera una nueva password temporal (mismo formato que creación), reemplaza el hash, marca el flag `must_change_password=true` e invalida cualquier token de reset self-service pendiente en `password_reset_tokens` (higiene). Reutiliza el mismo modal verde de "shown once" — el admin copia y comunica. Cubre tanto el onboarding inicial de los 8 estudiantes existentes como recuperación cuando olviden su password.
  - Archivos: `backend/server.js` (`POST /api/admin/users/:id/reset-password`), `src/lib/api.ts` (`adminResetUserPassword`), `src/components/AdminPanel.tsx` (botón + handler `handleResetUserPassword`).

- **Modal forzado de cambio de password al primer login** — Cuando un usuario ingresa con una password generada por el admin, el backend (`POST /api/auth/login` y `GET /api/auth/me`) devuelve `must_change_password: true`. El `Layout` suscribe a `onAuthStateChange` y monta `<ChangePasswordModal>` como overlay global sobre cualquier ruta activa. El modal pide: contraseña temporal (para verificar que el usuario la conozca — anti-hijack), nueva contraseña (mínimo 6 chars, sin requisitos de complejidad — UX simple para estudiantes), y confirmación. No puede cerrarse con ESC, click-outside, ni botón X — el usuario debe completar el cambio o hacer logout. Al completarse, el backend pone `must_change_password=false`, el frontend llama `clearMustChangePassword()` para limpiar el estado en memoria, y el modal desmonta.
  - Archivos: `backend/server.js` (`POST /api/auth/change-password`), `src/lib/api.ts` (`changePassword`, `clearMustChangePassword`), `src/components/ChangePasswordModal.tsx` (nuevo), `src/layouts/Layout.tsx` (integración global).

- **Migración 003 — columna `must_change_password`** — `ALTER TABLE profiles ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false`. Usuarios existentes arrancan en `false` (ya eligieron su password en auto-registro); los creados por admin o reseteados arrancan en `true`; se pone en `false` al completar el cambio. Bloque `DO` con validación que aborta la migración si encuentra usuarios con el flag ya en `true` (higiene). Comentario explicativo en la columna para documentar la semántica directamente en el schema.
  - Archivos: `migrations/003_must_change_password.sql`.

### Cambiado

- **`POST /api/auth/login` y `GET /api/auth/me`** — ambos endpoints ahora incluyen `must_change_password: boolean` en la respuesta del user. No se incluye en el JWT (sería inválido tras el cambio sin re-login); va solo en el payload del user para que el frontend decida si abrir el modal forzado.
  - Archivos: `backend/server.js`, `src/lib/api.ts` (`AuthUser` y `Profile` interfaces + `initAuth` rehydrate).

### Técnico

- **Decisión de diseño — password temporal legible sin ambigüedades visuales** — El alfabeto de `generateSecurePassword()` excluye `O/0`, `l/1/I` para reducir errores de lectura cuando el estudiante recibe la password por Teams en fuente no monoespaciada. Formato `XXXX-XXXX-XXXX` (12 chars + 2 guiones visuales) facilita la copia verbal en caso extremo. Entropía ~70 bits es aceptable para passwords de corta vida (el usuario debe cambiarla al primer login).

- **Decisión de diseño — dominio de email admitido en `POST /api/admin/users`** — La validación acepta `@unbosque.edu.co` y `@ceopacademia.org` (matching el CHECK `email_domain_check` de prod). En local el CHECK solo acepta `@unbosque.edu.co`; se confía en la DB como última línea de defensa si el admin intenta crear fuera de dominio permitido.

- **Decisión de diseño — profiles.role para rol "teacher"** — La tabla `profiles` tiene un CHECK heredado que solo admite `{admin, student}` en la columna legacy `role`. Cuando el admin crea un teacher desde `/admin`, en `profiles.role` queda `student` (valor placeholder), pero en `user_roles` (la tabla pivote RBAC multi-rol, fuente de verdad) queda `teacher`. El código frontend ya usa `roles` como fuente de verdad para decisiones.

## [3.1.0] — 2026-04-14

Release mayor con RBAC multi-rol, Panel Admin y Panel Teacher, sistema de reset de password (preparado, con link oculto en Plan C operativo), dominio `ceopacademia.org` verificado en Resend, y hardening de auth. Desplegado al droplet `159.203.189.167` con backup completo (pg_dump + copia de `/var/www/galeria-frontend`).

### Seguridad

- **Rotación de `RESEND_API_KEY`** — La key usada en dev local quedó expuesta en el transcript del chat con Claude Code. Decisión: **borrarla** en Resend sin generar reemplazo inmediato, ya que el Plan C tiene el link de reset oculto y no necesitamos Resend en prod por ahora. Efectos esperados: el endpoint `/api/auth/forgot-password` seguirá respondiendo 200 pero sin enviar email (modo dev-fallback que loguea el link a consola). El dominio `ceopacademia.org` sigue verificado (DKIM + SPF no se pierden al borrar la key). Para re-habilitar: seguir los pasos documentados en `backend/.env.example`.
  - Archivos: `backend/.env.example` (documentación del proceso de re-habilitación)

### Cambiado

- **Plan C operativo para reset de contraseña** — Ocultado el link "¿Olvidaste tu contraseña?" en `AuthModal` (mode login). Decisión tomada ante dos bloqueantes no resueltos para prod: (1) `@unbosque.edu.co` dropea silenciosamente correos de `ceopacademia.org` (transport rule institucional), y (2) Resend free está capado a 5 emails/día y 5/mes. Mientras se coordina con IT de El Bosque para whitelistar el dominio + upgrade a Resend Pro, el admin genera passwords temporales desde `/admin` (o SQL) y las comunica a los estudiantes por otro canal (Teams, presencial). **Los endpoints `/api/auth/forgot-password` y `/api/auth/reset-password` siguen funcionales en backend** — solo se oculta la entrada en la UI. Para re-habilitar cuando desbloqueen IT + Resend: descomentar el bloque en `src/components/AuthModal.tsx`.
  - Archivos: `src/components/AuthModal.tsx`

### Corregido

- **Email de reset — charset UTF-8 + desvinculación de marca institucional** — Dos ajustes al template HTML del email de recuperación de contraseña en `backend/server.js`:
  - **Mojibake arreglado**: el HTML no declaraba charset, por lo que Outlook (y otros clientes) interpretaban el cuerpo como Latin-1 / Windows-1252 y mostraban tildes y eñes como `�`. Fix: envolver el HTML en estructura completa (`<!DOCTYPE html>` + `<head>` con `<meta charset="UTF-8">`).
  - **Footer rebrand**: se removió "Universidad El Bosque" del pie. Dado que el email se envía desde `noreply@ceopacademia.org` (no desde un dominio institucional), representar la marca de la U sería incorrecto. Queda: "— Estudio de Creación Digital · CEOPAcademia".
  - Archivos: `backend/server.js`

### Documentado

- **Hallazgo bloqueante para prod — deliverability contra `@unbosque.edu.co`** — Durante el QA del Sprint 4, Resend reportó `delivered` pero los emails no llegaron al inbox institucional de Carlos, no aparecieron en spam, ni en la cuarentena de Microsoft Defender (`security.microsoft.com/quarantine`, 0 items incluso con "Show all senders"). Confirmación: el envío directo a un Outlook personal (`almeyda.ce@outlook.com`) llegó correctamente a "Correo no deseado" — validando que Resend + DKIM + SPF del dominio `ceopacademia.org` funcionan al 100%. Conclusión: El Bosque tiene una transport rule que dropea silenciosamente correos de dominios nuevos sin reputación. Implicaciones y opciones para resolver en prod:
  - **A)** Coordinar con IT de El Bosque para agregar `ceopacademia.org` a la lista de remitentes permitidos (Allow List) en Office 365. Proceso institucional que puede tomar días.
  - **B)** Agregar DMARC en DNS y dejar que el dominio acumule reputación con envíos legítimos (solución gradual, semanas).
  - **C)** Plan operativo: el admin genera passwords temporales al crear estudiantes y las comunica por otro canal (Teams, presencial). El reset self-service queda como conveniencia cuando A/B estén resueltos.
  - Este hallazgo extiende el checklist bloqueante de prod: además de rotar la `RESEND_API_KEY` (que quedó en el chat), hay que resolver deliverability antes de habilitar el flujo de reset para estudiantes.

- **Rate limit del plan free de Resend — bloqueante adicional para prod** — Headers de respuesta del SDK revelan `x-resend-daily-quota: 5` y `x-resend-monthly-quota: 5`. El plan free está capado a 5 emails/día y 5/mes, insuficiente para un curso con ~25 estudiantes. Antes de habilitar el flujo reset en prod hay que hacer upgrade a un plan pagado (Resend Pro: USD 20/mes, 50K emails). Alternativa temporal mientras: plan operativo C (admin genera passwords manualmente y las comunica por otro canal).

### Agregado

- **Dominio `ceopacademia.org` verificado en Resend** — Configurado vía integración OAuth con DigitalOcean (3 DNS records auto-creados: DKIM TXT `resend._domainkey`, MX `send` apuntando a SES de Amazon, SPF TXT `send`). Status `Verified` en Resend a las 10:36 PM del 2026-04-14. Backend actualizado en `.env` local: `RESEND_FROM=Galeria 3D <noreply@ceopacademia.org>` (reemplaza el default de dev `onboarding@resend.dev`). Envíos posteriores salen desde el dominio propio del proyecto.

- **Panel Teacher `/teacher` (Sprint 5)** — Vista read-only para profesores con la lista de SUS estudiantes asignados. El backend (`GET /api/teacher/students`) ya filtraba por rol; el frontend suma la página y link en `UserMenu`. Si el usuario es admin, ve a todos los estudiantes con la columna "Profesor" extra (reutiliza el mismo endpoint que ya soportaba ambos casos).
  - Protección `isTeacher(user) || isAdmin(user)`, redirige a home si no hay sesión, muestra "Acceso restringido" si no cumple rol.
  - Empty state distinto para teacher ("Aún no tienes estudiantes asignados") vs admin ("No hay estudiantes registrados todavía").
  - Fecha `assigned_at` formateada en español + link "Ver perfil" a `/estudiantes?focus={id}` por cada estudiante.
  - Link "Mis estudiantes" en `UserMenu` visible solo para `isTeacher(profile)` (puede aparecer junto a "Panel Admin" si el usuario tiene ambos roles, como Carlos).
  - Reutiliza los estilos `admin-*` existentes — sin CSS nuevo.
  - Archivos: `src/components/TeacherPanel.tsx`, `src/App.tsx`, `src/components/UserMenu.tsx`

- **Sistema de reset de contraseña (Sprint 4)** — Flujo completo para que los estudiantes recuperen acceso sin depender del admin.
  - **Backend**: dos endpoints nuevos en `server.js`:
    - `POST /api/auth/forgot-password` — genera token crudo de 32 bytes hex, guarda solo SHA-256 en `password_reset_tokens` con TTL de 1 hora, registra `ip_address` + `user_agent` para forense. Envía email HTML via Resend. **Respuesta siempre 200** (no revela si el email existe → previene enumeration). Si no hay `RESEND_API_KEY`, loguea el link a consola para dev.
    - `POST /api/auth/reset-password` — verifica hash, expiración y `used_at IS NULL`. Actualiza `profiles.password_hash` con bcrypt(10) + marca token usado + invalida cualquier otro token vigente del mismo usuario, todo en transacción.
  - **Frontend**:
    - `AuthModal` ahora tiene 3 modos: `login`, `register`, `forgot`. Link "¿Olvidaste tu contraseña?" en el modo login.
    - Nueva ruta `/reset-password?token=...` con página dedicada (`ResetPasswordPage`) — valida que token exista, pide nueva contraseña con confirmación, muestra feedback ok/error, redirige a home tras 2.5s en éxito.
    - Funciones API: `requestPasswordReset(email)`, `resetPassword(token, newPassword)`.
  - **Email**: HTML responsive con el link (copiable como texto abajo como fallback), marca institucional.
  - **Dependencia nueva**: `resend` (7 paquetes, 0 vulnerabilidades).
  - **Credenciales**: `RESEND_API_KEY` + `RESEND_FROM` + `APP_URL` en `backend/.env` (placeholder en `.env.example`). En dev, `RESEND_FROM=onboarding@resend.dev` funciona sin verificar dominio. En prod habrá que verificar `ceopacademia.org` en Resend y usar algo tipo `noreply@ceopacademia.org`.
  - Archivos: `backend/server.js`, `backend/.env.example`, `backend/package.json`, `backend/package-lock.json`, `src/lib/api.ts`, `src/components/AuthModal.tsx`, `src/components/ResetPasswordPage.tsx`, `src/App.tsx`, `src/styles/global.css`

### Técnico

- **Migración 002 — Backfill de emails institucionales (DB local)** — Los 7 estudiantes migrados desde producción no tenían `profiles.email` (columna vacía en el dump original). Bloqueante para Sprint 4 (password reset). Migración transaccional aplicada sobre `galeria_3d_local`: 7 UPDATEs por `full_name` exacto + bloque DO con validación `7/7 estudiantes con email institucional` antes del COMMIT. Todos los emails cumplen el CHECK `email_domain_check` (`@unbosque.edu.co`). Archivo reutilizable en Fase 2 (prod) con `psql --single-transaction -f migrations/002_backfill_student_emails.sql`.
  - Archivos: `migrations/002_backfill_student_emails.sql`

- **QA manual Sprint 3 RBAC — 5/5 PASS en local** — End-to-end validado en `localhost:5173` + backend `localhost:3000` + DB `galeria_3d_local`. Tests: (Q1) login admin + panel con 8 usuarios y chips multi-rol, (Q2) asignación teacher↔student de los 7 estudiantes a Carlos, (Q3) salvaguarda último admin retorna banner error sin mutar estado, (Q4) student logueado no ve link "Panel Admin", (Q5) student accediendo a `/admin` por URL ve "Acceso restringido". Defensa en profundidad confirmada en 3 capas (DB → Backend → Frontend). Usuario de pruebas `Job Dante Alegria` (`jdalegria@unbosque.edu.co`) creado vía `POST /api/auth/register` para validar flujo Register real — **existe solo en DB local**, no se propaga a prod.
  - Archivos: `docs/session-logs/2026-04-14.md`

### Agregado

- **Panel de administración `/admin` (Sprint 3.2)** — Nueva página React para gestión RBAC completa desde el frontend:
  - Ruta `/admin` protegida con `isAdmin(user)`: redirige al home si no hay sesión, muestra pantalla "Acceso restringido" si autenticado pero sin rol admin.
  - **Sección Usuarios & roles**: tabla con todos los usuarios, chips por rol (`admin` naranja, `teacher` morado, `student` cian), y 3 botones toggle `+/− admin|teacher|student`. Confirma por `window.confirm`, muestra feedback inline (ok/error), deshabilita botones mientras hay operación en curso, y surfaces el error "último admin" que viene del backend.
  - **Sección Teacher↔Student**: formulario con 3 selects (teacher, estudiante, cohort opcional) + listado completo de estudiantes con su teacher actual (admin ve todos) y botón "Desasignar" por fila.
  - Link "Panel Admin" en `UserMenu` (visible solo si `isAdmin(profile)`).
  - `UserMenu` ahora muestra chips multi-rol en el dropdown header (`Admin · Profesor`).
  - Estilos nuevos `admin-*` en `global.css` (tabla responsive, chips por rol, feedback banner, form grid).
  - Archivos: `src/components/AdminPanel.tsx`, `src/App.tsx`, `src/components/UserMenu.tsx`, `src/styles/global.css`

- **Frontend RBAC multi-rol — fundamentos (Sprint 3.1)** — `src/lib/api.ts` ampliado para soportar roles múltiples:
  - Tipos: `Role = 'admin' | 'teacher' | 'student'`, `AuthUser.roles[]`, `Profile.roles[]`, nuevos `AdminUser` y `TeacherStudent`.
  - Helpers: `isAdmin(u)`, `isTeacher(u)`, `isStudent(u)`, `hasRole(u, role)` — tolerantes a `null`/`undefined` y con fallback a `role` primario.
  - Funciones API admin: `getAdminUsers()`, `assignRole()`, `removeRole()`.
  - Funciones API teacher: `getTeacherStudents()`, `assignStudentToTeacher()`, `unassignStudentFromTeacher()`.
  - `initAuth()` ahora popula `currentUser.roles` desde el backend (con fallback `[profile.role]` por si aún no llega).
  - Los 8 call sites existentes con `profile.role === 'admin'` siguen funcionando sin cambios (compatibilidad total con `role` primario).
  - Build verde. Sin UI nueva todavía (Sub-sprint 3.2).
  - Archivos: `src/lib/api.ts`

- **Proxy Vite temporal a backend local (`http://localhost:3000`)** — Durante el desarrollo Sprint 3 del frontend multi-rol, `vite.config.ts` apunta `/api` al backend Express local (DB `galeria_3d_local`). El CDN sigue contra producción (bucket DO Spaces compartido). Documentado en el archivo con instrucciones explícitas para revertir antes del merge a `main`.
  - Archivos: `vite.config.ts`

- **Backend Express versionado en el monorepo (`backend/`)** — Decisión arquitectural: `backend/server.js` y dependencias quedan en este repo bajo `backend/`. `.env` y `node_modules` ignorados. `backend/.env.example` como template. El droplet sigue siendo la fuente de verdad de producción; el deploy a prod pasa por `scp backend/server.js root@droplet:/var/www/galeria-api/` + `pm2 restart` (ver skill `deploy-ghpages`).
  - Archivos: `backend/`, `.gitignore`, `backend/.env.example`

- **Refactor backend RBAC multi-rol (Sprint 2)** — `server.js` soporta ahora roles múltiples por usuario con fallback a `profiles.role` para migración soft.
  - **Helpers nuevos**: `getUserRoles(id)`, `isTeacherOf(teacherId, studentId)`, `primaryRole(roles)`, `hasAnyRole(req, ...)`.
  - **Middleware `requireRole(...allowed)`** reemplaza `adminOnly`. Acepta lista de roles permitidos.
  - **JWT payload ahora incluye `roles: string[]`** además de `role: string` (compat con frontend actual).
  - **Login/Register/Me** cargan roles desde `user_roles` con JOIN.
  - **Register** valida dominio `@unbosque.edu.co` antes de golpear DB + crea entrada en `user_roles`.
  - **`PUT/DELETE /api/models/:id`**: permisos owner OR admin OR teacher-del-owner (via `teacher_students`).
  - **`PUT /api/profiles/:id`** y **`PUT /api/skills/:userId`**: self OR admin OR teacher-del-owner.
  - **Nuevos endpoints admin**: `GET /api/admin/users`, `POST/DELETE /api/admin/users/:id/roles`, `POST/DELETE /api/admin/teacher-students`. Salvaguarda: no permite quitar el último admin del sistema.
  - **Nuevo endpoint teacher**: `GET /api/teacher/students` — teachers ven solo sus asignados, admin ve todos con nombre del teacher.
  - **15/15 tests curl pasaron**. Frontend sin tocar (Sprint 3).

### Corregido

- **Bug pre-existente — orden de rutas `/api/models/reorder`** — La ruta estaba declarada DESPUÉS de `/api/models/:id`, lo que hacía que Express capturara `reorder` como `:id` y fallara con 500 (UUID inválido en query). Afectaba también a producción. Ahora `/reorder` va ANTES de `/:id` (orden correcto de rutas estáticas antes que paramétricas).

### Técnico

- **Migración 001 — RBAC multi-rol (DB local, Sprint 1)** — Schema de Diego aplicado en transacción sobre `galeria_3d_local`. Nuevas tablas: `roles` (catálogo admin/teacher/student con IDs fijos e `is_system`), `user_roles` (pivote M:N profile↔role con auditoría), `teacher_students` (pivote M:N con cohort + trigger validador de rol teacher), `password_reset_tokens` (tokens hasheados SHA-256 + forense ip/user_agent). CHECK constraint `email_domain_check` forza dominio `@unbosque.edu.co`. Backfill: 8 profiles migrados a `user_roles`; Carlos recibe doble rol (admin + teacher). `profiles.role` intacto como fallback durante Sprint 2. **Aún no aplicada en producción** — se ejecuta en Fase 2 tras QA verde del backend refactorizado.
  - Archivos: `migrations/001_rbac_multi_role.sql`

- **Skills `deploy-ghpages` y `qa` actualizados al stack real** — Ambos skills referenciaban Astro + Supabase + GitHub Pages. Reescritos para reflejar Vite + Express + PostgreSQL 16 + DigitalOcean Droplet + Nginx + PM2. Incluyen URLs de producción (`ceopacademia.org`), protocolo de deploy por `scp + pm2 restart`, rondas de QA adaptadas a API REST + JWT, y sección de rollback por capa (frontend / backend / DB). Principio "local es fuente de verdad" formalizado.
  - Archivos: `.claude/skills/deploy-ghpages/SKILL.md`, `.claude/skills/qa/SKILL.md`

- **Informe técnico de Diego Ramírez — Diseño RBAC** — Revisión DBA del schema propuesto para multi-rol (admin/teacher/student) y relación profesor↔estudiante. 8 mejoras críticas: `roles.id` con IDs fijos (no SERIAL), `assigned_by ON DELETE SET NULL`, índice secundario en `role_id`, tabla pivote `teacher_students` (N:M) en vez de `teacher_id` en profiles, trigger de validación de rol, tokens de reset con hash SHA-256, CHECK constraint para dominio `@unbosque.edu.co`, estrategia para JWT stale. Schema final listo para Sprint 1.
  - Archivos: `docs/informes/2026-04-14-diego-diseno-roles-rbac.md`

- **Gitignore: `backend/` y `backups/`** — El backend Express clonado localmente desde el droplet y los dumps de DB no se versionan hasta decisión arquitectural sobre versionado del backend.
  - Archivos: `.gitignore`

### Agregado

- **Migración completa Supabase → DigitalOcean** — Backend propio reemplaza Supabase por completo. Nuevo stack: Express + PostgreSQL 16 + DigitalOcean Spaces + JWT auth. Login responde en <100ms (Supabase colgaba indefinidamente). Bundle reducido ~200KB al eliminar SDK Supabase.
  - **API REST**: `src/lib/api.ts` — cliente con JWT token management, auth state listeners, todas las funciones CRUD
  - **Backend**: Express en droplet (PM2), rutas para auth, models, profiles, likes, comments, skills, thumbnails
  - **Storage**: GLB files y thumbnails en DO Spaces, servidos via Nginx proxy `/cdn/`
  - **Auth**: JWT custom con bcryptjs (7 días expiración), roles admin/student
  - **Datos migrados**: 8 perfiles, 13 modelos, 22 likes, 3 comentarios, 42 skills
  - **Archivos migrados**: 13 GLBs + 13 thumbnails de Supabase Storage a DO Spaces (~55MB)
  - Archivos nuevos: `src/lib/api.ts`
  - Archivos actualizados: todos los componentes (imports cambiados de supabase.ts a api.ts)

- **Thumbnails calidad Sketchfab (720x405)** — Canvas de generación a 720x405px (16:9, mismo ratio que Sketchfab) con dpr=2 y WebP 0.85. Thumbnails anteriores eran de 1-2KB (generados cuando el login estaba roto).
  - Archivos: `ThumbnailGenerator.tsx`, `ThumbnailCapture.tsx`

- **Botón admin "Regenerar Thumbnails"** — Permite regenerar todos los thumbnails desde la galería (no solo los faltantes). Prop `regenerateAll` en ThumbnailGenerator.
  - Archivos: `Gallery.tsx`, `ThumbnailGenerator.tsx`

- **Proxy CDN en Nginx** — Ruta `/cdn/` proxy reverso a DO Spaces CDN. Evita problemas de CORS con Three.js. Las URLs de modelos son relativas (`/cdn/models/...`).
  - Archivos: Nginx config en droplet, `vite.config.ts` (proxy dev)

- **Documentación de deploy** — Guía completa con credenciales, estructura, endpoints API, comandos de monitoreo.
  - Archivos: `docs/deploy.md`

- **Dominio ceopacademia.org + SSL** — Dominio conectado desde Hostinger (nameservers transferidos a DigitalOcean). Registros A para `@` y `www` → 159.203.189.167. SSL con Let's Encrypt (certbot), auto-renovación, HTTP redirige a HTTPS.
  - Nginx: `server_name ceopacademia.org www.ceopacademia.org`

- **Code splitting Three.js** — Three.js (~847KB) se carga on-demand con `React.lazy()` en vez de en la carga inicial. Carga inicial reducida de ~1.3MB a ~317KB. ModelModal, UploadForm, EditModelForm y ThumbnailGenerator son lazy-loaded.
  - Archivos: `Gallery.tsx` (lazy imports), `ModelModal.tsx`, `ModelScene.tsx`

- **Loading estilo Sketchfab en ModelModal** — Al abrir un modelo, se muestra el thumbnail como placeholder con blur + spinner. Cuando el GLB termina de cargar, el Canvas 3D hace crossfade sobre el thumbnail (transición 0.6s). Elimina el fondo negro vacío durante la carga.
  - Archivos: `ModelModal.tsx`, `ModelScene.tsx` (onLoaded callback), `global.css` (crossfade CSS)

### Mejorado

- **CSS card-viewer 16:9** — Cambio de `height: 320px` fijo a `aspect-ratio: 16/9` para que las cards sean responsive y coincidan con el ratio de los thumbnails.
  - Archivos: `global.css`

- **Iluminación de thumbnails** — Dos luces direccionales, environment intensity 0.5, ambient 0.2 para mejor calidad de captura.
  - Archivos: `ThumbnailGenerator.tsx`

### Corregido

- **Login Supabase colgaba indefinidamente** — `signInWithPassword` retornaba HTTP 200 pero el SDK JS nunca resolvía la Promise. Causa raíz nunca identificada en el SDK. Solución: reemplazar Supabase completamente con JWT custom.

- **ThumbnailCapture disparaba antes de cargar modelo** — ThumbnailCapture estaba fuera de Suspense, useFrame contaba frames antes de que el GLB cargara. Fix: mover dentro de `<Suspense>` junto a `<Model3D>`.
  - Archivos: `ThumbnailGenerator.tsx`, `ThumbnailCapture.tsx`

### Eliminado

- **Dependencia de Supabase** — `@supabase/supabase-js` ya no se usa. `src/lib/supabase.ts` reemplazado por `src/lib/api.ts`.

### Técnico

- **Infraestructura DigitalOcean** — Droplet Ubuntu 24.04 (159.203.189.167), Nginx, PM2, PostgreSQL 16, DO Spaces (galeria-3d-files, nyc3).

---

## [Unreleased - pre migration]

### Corregido

- **Reordenamiento drag-and-drop no guardaba** — `upsert` disparaba la política INSERT de RLS (error 42501) porque PostgreSQL evalúa INSERT antes de resolver ON CONFLICT. Fix: cambiar a `update` individuales con `Promise.all`, que solo dispara la política UPDATE permitida para admin.
  - Archivos: `src/lib/supabase.ts`

- **Modelos con Draco compression no cargaban** — Los GLB exportados con `KHR_draco_mesh_compression` (3 modelos PBR de Substance Painter) se quedaban en "Cargando 3D..." indefinidamente. Fix: configurar `useGLTF.setDecoderPath()` con el CDN de Google Draco decoders.
  - Archivos: `Model3D.tsx`

### Mejorado

- **Lazy loading de Canvas WebGL** — Las tarjetas solo crean su Canvas 3D cuando son visibles en el viewport (IntersectionObserver con 200px de margen). Reduce contextos WebGL activos y consumo de GPU.
  - Archivos: `ModelCard.tsx`

- **Deploy a Hostinger** — Configuración para dominio raíz: `base: '/'` en Vite, BrowserRouter sin basename, `.htaccess` para SPA routing en Apache.
  - Archivos: `vite.config.ts`, `main.tsx`, `public/.htaccess`

### Agregado

- **Migración completa Astro 6 → Vite + React + React Three Fiber** — Reemplaza la arquitectura MPA de Astro por una SPA con Vite + React Router, resolviendo definitivamente los bugs de renderización WebGL/SVG al navegar entre páginas (bfcache, prefetch, Speculation Rules). React Three Fiber reemplaza model-viewer para el renderizado 3D.
  - **Nuevo stack**: Vite 6 + React 19 + React Router 7 + @react-three/fiber + @react-three/drei + Three.js
  - **Componentes R3F**: `Model3D.tsx` (carga GLB, centrado automático, fix color space), `ModelScene.tsx` (escena studio con environment IBL, suelo mate, contact shadows, fog)
  - **SPA routing**: `App.tsx` con React Router, `Layout.tsx` con NavLink, `404.html` para GitHub Pages
  - **Optimización GPU**: `frameloop="demand"` en tarjetas (0 fps cuando no hay hover), auto-rotate solo en hover
  - **Iluminación studio**: Environment preset studio (0.4), ambient (0.15), dual directional lights, suelo mate #222 con ContactShadows
  - **Archivos nuevos**: `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/layouts/Layout.tsx`, `src/components/Model3D.tsx`, `src/components/ModelScene.tsx`, `src/pages/GaleriaPage.tsx`, `public/404.html`
  - **Archivos actualizados**: `ModelCard.tsx`, `ModelModal.tsx`, `UploadForm.tsx`, `EditModelForm.tsx`, `UserMenu.tsx`, `index.html`, `tsconfig.json`, `package.json`

### Eliminado

- **Archivos Astro**: `index.astro`, `estudiantes.astro`, `perfil.astro`, `Layout.astro`, `astro.config.mjs` — ya no necesarios tras migración a SPA
- **Dependencias Astro**: `astro`, `@astrojs/react`, `@astrojs/sitemap` removidos de package.json

### Agregado

- **Reordenamiento drag-and-drop de tarjetas (admin)** — El administrador puede cambiar el orden de las tarjetas de modelos arrastrándolas. Botón "↕ Reordenar" en la barra de filtros activa el modo; disponible solo en vista "Todos". El orden se persiste en Supabase con un campo `sort_order INTEGER`. Cambio de orden usa optimistic update + upsert en background con indicador "guardando orden…" / "✓ guardado".
  - Librería: `@dnd-kit/core` + `@dnd-kit/sortable` (única opción compatible con React 19)
  - Handle: icono 6 puntos top-right de cada tarjeta, visible solo en modo reordenar
  - Archivos: `supabase.ts` (interfaz `ModelRow.sort_order`, `updateModelOrder()`), `SortableModelCard.tsx` (nuevo), `Gallery.tsx`, `global.css`
  - SQL migration requerida: `ALTER TABLE models ADD COLUMN sort_order INTEGER DEFAULT 2147483647; UPDATE models SET sort_order = (ROW_NUMBER() OVER (ORDER BY created_at DESC)) * 1000;`

### Corregido

- **Modelos 3D y gráficos SVG no renderizan al navegar entre páginas** — Astro 6 tiene `prefetch` habilitado por defecto, que usa la Speculation Rules API de Chrome para pre-renderizar páginas al hacer hover. WebGL (model-viewer) y custom elements no se inicializan correctamente en contextos pre-renderizados. Fix: `prefetch: false` en `astro.config.mjs`. Hard reload funcionaba porque bypassa el pre-render; navegación normal no porque servía la página pre-renderizada rota.
  - Archivos: `astro.config.mjs`

- **Galería y Estudiantes no cargan en Edge tras primer reload** — Edge Enhanced Security Mode bloquea silenciosamente el refresh del token de Supabase v2, dejando `getSession()` colgada indefinidamente. Fix: `getSessionSafe()` en `supabase.ts` — wrapper con timeout de 5s que trata la sesión como null si no resuelve, garantizando que las queries públicas siempre se ejecuten.
  - Archivos: `supabase.ts`, `Gallery.tsx`, `EstudiantesPage.tsx`

- **Blancos y parpadeos al editar/subir/borrar modelos** — `loadModels()` hacía `setLoading(true)` en cada operación CRUD, desmontando todos los `<model-viewer>` y destruyendo sus contextos WebGL. Fix: separar `initialLoading` (primera carga, puede desmontar grid) de `refreshing` (actualizaciones post-CRUD, grid permanece montado). Los model-viewer nunca se desmontan en operaciones normales.
- **Race condition en llamadas concurrentes a loadModels** — Si se llamaba dos veces seguido, la respuesta más lenta podía sobreescribir la más reciente. Fix: `loadVersionRef` cancela respuestas stale.
- **Loading infinito si getSession() falla** — `init()` no tenía try/catch envolvente; si `getSession()` lanzaba excepción, `setInitialLoading(false)` nunca corría. Fix: try/catch con fallback a `setInitialLoading(false)`.
- **Indicador de refresh sutil** — Al actualizar datos post-CRUD aparece "actualizando…" junto al contador de modelos (sin reemplazar el grid).
  - Archivos: `Gallery.tsx`, `global.css`

### Agregado

- **Contador de comentarios en ModelCard** — Icono de burbuja de chat con conteo de comentarios junto al corazón de likes, estilo Instagram. Solo informativo (no clickeable). Nuevas funciones: `fetchCommentCounts()` en `supabase.ts`; nuevo prop `commentCount` en `ModelCard`.
  - Archivos: `supabase.ts`, `Gallery.tsx`, `ModelCard.tsx`, `global.css`

### Corregido

- **Galería no se refresca al borrar/subir/editar modelo** — `loadModels()` se llamaba en `handleDelete`, `UploadForm.onSuccess` y `EditModelForm.onSave` pero la función nunca estaba definida, causando `ReferenceError`. Fix: extraer la lógica de fetch (modelos + likes + comments) del `init()` a una función `loadModels()` reutilizable.
  - Archivos: `Gallery.tsx`

- **Comentarios con 400 Bad Request** — `.select('*, profiles(full_name, role)')` en PostgREST falla si la FK `comments_user_id_fkey` apunta a `auth.users` en lugar de `public.profiles`. Fix: reemplazado join PostgREST por dos queries separadas — `fetchComments` hace `select('*')` y luego fetch de profiles por `user_id[]`; `addComment` hace lo mismo post-insert. La interfaz `CommentRow` no cambia.
  - Archivos: `supabase.ts`

- **Queries Supabase colgadas con sesión activa en Gallery y EstudiantesPage** — Supabase v2 encola todas las queries mientras refresca el token. Las queries lanzadas antes de que `getSession()` resuelva nunca se envían a la red. Fix: función `init()` que hace `await getSession()` primero, luego ejecuta las queries. Aplicado en Gallery.tsx y EstudiantesPage.tsx.
  - Archivos: `Gallery.tsx`, `EstudiantesPage.tsx`

- **Loading infinito en /estudiantes para admin logueado** — En Supabase v2, el cliente refresca el token al inicializarse. Queries lanzadas antes de que el refresh complete quedan en cola indefinidamente (sin error, sin timeout). Fix: registrar `onAuthStateChange` antes de lanzar `loadData()` — esto completa la inicialización de auth. Agregado flag `isMounted` para evitar setState en componente desmontado.
  - Archivos: `EstudiantesPage.tsx`

- **Modal de login descentrado** — `#top-bar` tiene `backdrop-filter` que crea un nuevo containing block para `position: fixed`, haciendo que el overlay del modal quedara posicionado relativo al top bar (44px) en lugar del viewport. Solución: `createPortal` en `AuthModal.tsx` para renderizar el modal directo en `document.body`.
  - Archivos: `AuthModal.tsx`

- **Loading infinito en /estudiantes, /galeria y /perfil** — Las funciones async `loadData()`, `loadModels()` y `load()` no tenían `try/catch`. Si Supabase fallaba, `setLoading(false)` nunca se ejecutaba y el componente quedaba atrapado en spinner. Agregado `try/catch/finally` en los tres componentes.
  - Archivos: `EstudiantesPage.tsx`, `Gallery.tsx`, `ProfilePage.tsx`

- **Mutación directa de prop en StudentCard** — `handleSaveLinks()` mutaba directamente `student.artstation_url` y `student.instagram_url`. React no detecta estas mutaciones y la vista no se actualizaba. La vista ahora usa el estado local `artstation`/`instagram` que sí se actualiza al guardar.
  - Archivos: `StudentCard.tsx`

- **getUserProfile() retornaba undefined** — `.single()` de Supabase retorna `undefined` si no hay fila. Los componentes chequean `!profile` y `undefined` no se comporta igual que `null`. Cambiado a `return data ?? null`.
  - Archivos: `supabase.ts`

- **Eliminado ClientRouter (ViewTransitions)** — Se removió `ClientRouter` de `Layout.astro`. La navegación SPA de Astro no es compatible con múltiples React islands `client:load` simultáneos: los componentes no se rehidratan correctamente en el swap de página, causando pantallas en blanco. Se vuelve a navegación estándar con recarga completa, que es el comportamiento correcto para este stack.
  - Archivos: `Layout.astro`

- **ArtStationIcon eliminado** — Componente `ArtStationIcon` en `StudentCard.tsx` tenía un path SVG corrupto (`7.messages`) y no se usaba en ningún lugar. Eliminado.
  - Archivos: `StudentCard.tsx`

### Agregado

- **Barra superior global con UserMenu** — Top bar sticky en todas las páginas con navegación (Galería, Estudiantes) y badge de usuario a la derecha. Si está logueado muestra dropdown con Ver Perfil, Editar Perfil y Logout. Si no, muestra botón Login.
  - Archivos: `Layout.astro`, `UserMenu.tsx`, `global.css`

- **Página /perfil** — Vista y edición del perfil de usuario: nombre completo, bio (150 chars, límite Instagram), ArtStation URL, Instagram URL. Accesible desde el dropdown del UserMenu.
  - Archivos: `perfil.astro`, `ProfilePage.tsx`, `supabase.ts` (función `updateProfile`)

- **Bio card en tarjetas de estudiante** — Pequeña tarjeta debajo del gráfico hexagonal con links a ArtStation e Instagram. El estudiante autenticado puede editar sus propios links inline; el admin los gestiona desde el Editor de Habilidades.
  - Archivos: `StudentCard.tsx`, `SkillsEditor.tsx`, `EstudiantesPage.tsx`, `global.css`

- **Campos artstation_url / instagram_url en profiles** — Se agregaron columnas a la tabla `profiles` y política RLS para que el admin pueda actualizar el perfil de cualquier estudiante.
  - Archivos: `supabase.ts` (interface `Profile`, `StudentWithSkills`, función `updateStudentLinks`)

---

### Técnico

- **Configuración workflow Claude Code** — Se adopta el mismo esquema de trabajo que AplicacionCarteraCEOP: CLAUDE.md con reglas obligatorias, skills especializados con personas nombradas, comandos slash, metodología Scrumban, estructura docs/.
  - Archivos: `CLAUDE.md`, `.claude/settings.local.json`, `.claude/README.md`, `.claude/skills/` (9 skills), `.claude/commands/` (8 comandos), `docs/plans/`, `docs/session-logs/`, `docs/informes/`, `docs/qa/`

- **Equipo de especialistas definido** — Claude Renard (Líder), Sebastián Torres Mejía (Dev), Laura Botero Ríos (Planificadora), Natalia Vargas Ospina (Arquitecta), Isabella Moreno Ríos (Frontend 3D), Andrés Cano Herrera (Testing), Diego Ramírez Castellanos (Seguridad), Mateo Gutiérrez Reyes (DevOps), Valentina Soto Parra (QA Lead).

---

## [v1.1.0] — 2026-03-27

### Agregado

- **GitHub Actions workflow para deploy a GitHub Pages** — Workflow automático que hace build de Astro y publica `dist/` en la rama `gh-pages` al hacer push a `main`. Node.js 22.
  - Archivo: `.github/workflows/deploy.yml`

### Mejorado

- **Lazy loading en ModelCard** — `loading="lazy"` y `reveal="interaction"` en model-viewer para que los modelos fuera del viewport no bloqueen la carga inicial de la página.
  - Archivo: `src/components/ModelCard.tsx`

- **Carga async de model-viewer y preconnect a Supabase** — Script de model-viewer cargado con `type="module"` asíncrono. `<link rel="preconnect">` a los dominios de Supabase para reducir latencia de las queries iniciales.
  - Archivo: `src/layouts/Layout.astro`

### Técnico

- **Node.js actualizado a v22 en deploy.yml** — Alineado con la versión especificada en `package.json` (`engines.node >= 22.12.0`).
  - Archivo: `.github/workflows/deploy.yml`

---

## [v1.0.0] — 2026-03-27

### Agregado

- **Galería 3D interactiva completa** — Reescritura total del proyecto de HTML estático a Astro 6 + React 19 con Supabase como backend.
  - Stack: Astro 6 (SSG) + React 19 + Supabase + model-viewer + CSS custom
  - Deploy: GitHub Pages con base `/galeria-3d-clase`

- **Sistema de autenticación** — Login y registro con Supabase Auth. Roles `admin` (profesor) y `student` (estudiante). Modal de auth no invasivo con tabs login/registro.
  - Archivos: `src/components/AuthModal.tsx`, `src/lib/supabase.ts`

- **Galería con filtros por categoría** — Grid responsivo de tarjetas de modelos. Filtros por categoría: personaje, vehículo, criatura, objeto. Carga desde Supabase en tiempo real.
  - Archivos: `src/components/Gallery.tsx`, `src/components/ModelCard.tsx`

- **Vista detallada de modelos** — Modal con model-viewer a tamaño completo, camera controls, auto-rotate y soporte AR. Panel de información con título, descripción, tags, estudiante y fecha.
  - Archivo: `src/components/ModelModal.tsx`

- **Sistema de likes** — Toggle de like con animación heart pop. Conteo por modelo. Un like por usuario por modelo (enforced en Supabase RLS).
  - Archivos: `src/components/ModelCard.tsx`, `src/lib/supabase.ts`

- **Sistema de comentarios** — Comentarios en modal de detalle. Solo usuarios autenticados pueden comentar. Admins y autores pueden borrar comentarios.
  - Archivos: `src/components/ModelModal.tsx`, `src/lib/supabase.ts`

- **Upload de modelos GLB** — Formulario de carga con drag & drop. Sube GLB a Supabase Storage y crea registro en tabla `models`. Solo admins y students autenticados.
  - Archivo: `src/components/UploadForm.tsx`

- **Edición de modelos** — Formulario para editar metadata (título, descripción, categoría, tags). CRUD según rol: admin edita todos, student solo los suyos.
  - Archivo: `src/components/EditModelForm.tsx`

- **Diseño dark theme** — Hero section estilo portfolio con grid background decorativo, glow effects, tipografías Bebas Neue + JetBrains Mono. Estética dark + neubrutalism + 3D tech.
  - Archivos: `src/pages/index.astro`, `src/styles/global.css`, `src/layouts/Layout.astro`

- **Backend Supabase** — Cliente singleton, interfaces TypeScript para `ModelRow`, `Profile`, `CommentRow`. Helpers para auth, likes, comentarios y perfiles.
  - Archivo: `src/lib/supabase.ts`

---

## [v0.1.0] — 2026-03-26

### Agregado

- **Prototipo HTML estático** — Galería inicial con HTML + CSS + model-viewer. Cards con modelos GLB de estudiantes (dwarf_sword y otros). Semestre 2026-1, Universidad El Bosque.
  - Archivo: `index.html`
