-- =============================================================
-- Migración 001 — RBAC multi-rol + relación teacher↔student
-- =============================================================
-- Autor:   Diego Ramírez Castellanos (Data Lead)
-- Fecha:   2026-04-14
-- Informe: docs/informes/2026-04-14-diego-diseno-roles-rbac.md
--
-- Cambios:
--   - Tabla `roles` con IDs fijos (admin=1, teacher=2, student=3)
--   - Tabla pivote `user_roles` (M:N) reemplaza lógicamente `profiles.role`
--   - Tabla `teacher_students` (M:N con cohort) para relación profesor↔estudiante
--   - Tabla `password_reset_tokens` (tokens hasheados SHA-256)
--   - CHECK constraint de dominio institucional @unbosque.edu.co
--   - Trigger que valida que teacher_id tenga rol teacher
--   - Backfill: una fila en user_roles por cada profile según su role actual
--   - Carlos (admin) recibe también rol teacher
--
-- IMPORTANTE: esta migración NO elimina `profiles.role`. El DROP
-- de esa columna va en una migración separada (002) tras 48h de
-- observación en prod con el backend leyendo de user_roles.
--
-- Ejecutar en transacción. Si algo falla → ROLLBACK automático.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Tabla roles (catálogo fijo)
-- -------------------------------------------------------------
CREATE TABLE roles (
  id          SMALLINT PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (id, name, description, is_system) VALUES
  (1, 'admin',   'Superusuario del sistema',       TRUE),
  (2, 'teacher', 'Profesor con estudiantes',       TRUE),
  (3, 'student', 'Estudiante de la galería',       TRUE);

-- -------------------------------------------------------------
-- 2. Tabla pivote user_roles (M:N profile ↔ role)
-- -------------------------------------------------------------
CREATE TABLE user_roles (
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id     SMALLINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);

-- -------------------------------------------------------------
-- 3. Tabla teacher_students (M:N con cohort)
-- -------------------------------------------------------------
CREATE TABLE teacher_students (
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cohort      TEXT,
  PRIMARY KEY (teacher_id, student_id)
);

CREATE INDEX idx_teacher_students_student ON teacher_students(student_id);

-- -------------------------------------------------------------
-- 4. Trigger: valida que teacher_id tenga rol teacher
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_teacher_has_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = NEW.teacher_id AND ur.role_id = 2  -- teacher
  ) THEN
    RAISE EXCEPTION 'User % does not have teacher role', NEW.teacher_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_teacher
BEFORE INSERT OR UPDATE ON teacher_students
FOR EACH ROW EXECUTE FUNCTION validate_teacher_has_role();

-- -------------------------------------------------------------
-- 5. Tabla password_reset_tokens (hasheados, con forense)
-- -------------------------------------------------------------
CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_reset_tokens_expires ON password_reset_tokens(expires_at)
  WHERE used_at IS NULL;

-- -------------------------------------------------------------
-- 6. CHECK constraint: dominio institucional @unbosque.edu.co
-- -------------------------------------------------------------
-- Permite NULL (estudiantes migrados sin email aún)
-- Estricto: solo @unbosque.edu.co (sin subdominios). Flexibilizar después si se añade @post.unbosque.edu.co u otros.
ALTER TABLE profiles
  ADD CONSTRAINT email_domain_check
  CHECK (email IS NULL OR email ~ '^[^@]+@unbosque\.edu\.co$');

-- -------------------------------------------------------------
-- 7. Backfill: user_roles desde profiles.role
-- -------------------------------------------------------------
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT
  p.id,
  CASE p.role
    WHEN 'admin'   THEN 1
    WHEN 'teacher' THEN 2
    WHEN 'student' THEN 3
  END AS role_id,
  NULL  -- histórico, sin auditor
FROM profiles p
WHERE p.role IN ('admin', 'teacher', 'student');

-- Carlos es admin Y también teacher
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT id, 2, id
FROM profiles
WHERE email = 'calmeydar@unbosque.edu.co'
ON CONFLICT DO NOTHING;

COMMIT;
