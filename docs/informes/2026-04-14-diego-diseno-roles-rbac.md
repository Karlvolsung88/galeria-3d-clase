---
autor: Diego Ramírez Castellanos
cargo: Data Lead & Arquitecto de Datos
fecha: 2026-04-14
tema: Diseño del sistema de roles (RBAC) y relación profesor-estudiante
estado: revision
---

# Informe técnico — Diseño de roles y permisos

## Contexto

El equipo propuso agregar un rol `teacher` al sistema, permitir múltiples roles por usuario, y establecer una relación profesor↔estudiante. Se propusieron tres alternativas:

1. `roles TEXT[]` — array en columna
2. Tabla pivote `user_roles` (RBAC clásico) — **aprobado preliminarmente**
3. JSONB — descartado por overkill

Vengo a respaldar la opción 2 con matices, señalar riesgos del diseño propuesto, y proponer mejoras concretas.

## Revisión del schema propuesto

### Lo que está bien

- **Tabla pivote `user_roles`** es el patrón correcto para RBAC. Está bien normalizado.
- **PK compuesta `(user_id, role_id)`** evita duplicados automáticamente.
- **ON DELETE CASCADE en user_id y role_id** mantiene la integridad sin huérfanos.
- **Columna `assigned_by`** para auditoría — excelente decisión.

### Lo que necesita ajustes

Voy punto por punto.

#### 1. `roles.id SERIAL` — cambiar a INT con valores fijos

El auto-incremento en una tabla de enumeración es un anti-patrón. Si en dev los roles quedan `{1:admin, 2:teacher, 3:student}` pero en prod se crean en otro orden, los IDs divergen y las queries se rompen.

**Propongo:** IDs explícitos como constantes:

```sql
CREATE TABLE roles (
  id SMALLINT PRIMARY KEY,  -- NO SERIAL
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,  -- protege roles críticos
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (id, name, description, is_system) VALUES
  (1, 'admin',   'Superusuario del sistema',      TRUE),
  (2, 'teacher', 'Profesor con estudiantes',      TRUE),
  (3, 'student', 'Estudiante de la galería',      TRUE);
```

`SMALLINT` ahorra espacio (2 bytes vs 4), y los roles pueden crecer a 32.767 entradas sin problema.

`is_system = TRUE` previene que un admin accidentalmente borre el rol `admin` y deje el sistema sin superusuarios.

#### 2. `assigned_by` debe permitir NULL on delete

Actualmente:
```sql
assigned_by UUID REFERENCES profiles(id)
```

Si borras al profesor que asignó el rol, PostgreSQL bloquea el DELETE por el FK. Mal.

**Propongo:**
```sql
assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL
```

Preservas el historial aunque el usuario que asignó ya no exista.

#### 3. Falta índice secundario en `role_id`

La PK `(user_id, role_id)` indexa empezando por `user_id`. Consultas como *"¿quiénes son todos los admins?"* hacen scan completo.

**Propongo:**
```sql
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
```

Es barato y evita problemas al escalar.

#### 4. Relación profesor↔estudiante: `teacher_id` es frágil

La propuesta `profiles.teacher_id UUID` tiene dos problemas:

**Problema A — No hay constraint de rol:**
Nada impide que `teacher_id` apunte a un usuario que NO es profesor (podría apuntar a otro estudiante, o al admin que no tiene rol teacher).

**Problema B — Limitación 1:N:**
Un estudiante solo puede tener UN profesor. Si en el futuro un estudiante toma clases con varios docentes (seminarios, asesorías), hay que refactorizar.

**Propongo una tabla separada:**

```sql
CREATE TABLE teacher_students (
  teacher_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cohort        TEXT,  -- opcional: '2026-1', 'taller-avanzado', etc.
  PRIMARY KEY (teacher_id, student_id)
);

CREATE INDEX idx_teacher_students_student ON teacher_students(student_id);
```

Ventajas:
- **N:M**: un estudiante puede tener varios profesores y viceversa.
- **Cohort** para futuro (semestres, talleres).
- **Auditoría** consistente con `user_roles`.
- Si se borra el profesor o el estudiante, limpia solo esa relación.

Validación de rol se puede hacer vía **trigger** o **en la capa de aplicación** (pragmático, suficiente). Un trigger:

```sql
CREATE OR REPLACE FUNCTION validate_teacher_has_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = NEW.teacher_id AND r.name = 'teacher'
  ) THEN
    RAISE EXCEPTION 'User % does not have teacher role', NEW.teacher_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_teacher
BEFORE INSERT OR UPDATE ON teacher_students
FOR EACH ROW EXECUTE FUNCTION validate_teacher_has_role();
```

Opinión: el trigger es defensa en profundidad. La capa de aplicación también debe validarlo para UX.

#### 5. Tokens de reset password

La tabla propuesta en la sesión anterior:

```sql
CREATE TABLE password_reset_tokens (
  token TEXT PRIMARY KEY, ...
);
```

**Mejoras críticas de seguridad:**

```sql
CREATE TABLE password_reset_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   TEXT NOT NULL UNIQUE,  -- NO el token plano, hash SHA-256
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address   INET,         -- forense
  user_agent   TEXT          -- forense
);

CREATE INDEX idx_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_reset_tokens_expires ON password_reset_tokens(expires_at)
  WHERE used_at IS NULL;

-- Job de limpieza (cron semanal en el droplet)
DELETE FROM password_reset_tokens
  WHERE expires_at < NOW() - INTERVAL '7 days';
```

**Razones:**
- **`token_hash` en vez de `token`**: si alguien lee la DB (backup filtrado, dump robado), no puede reutilizar los tokens. El token plano solo vive en el email del usuario y en memoria del servidor un instante.
- **`ip_address`, `user_agent`**: útil si alguien reporta que recibió un email sospechoso.
- **Limpieza programada**: tokens viejos son ruido y PII residual.

#### 6. Validación de dominio @unbosque.edu.co

**Defensa en profundidad — dos capas:**

**Capa DB (defensiva):**
```sql
ALTER TABLE profiles ADD CONSTRAINT email_domain_check
  CHECK (email IS NULL OR email ~ '^[^@]+@unbosque\.edu\.co$');
```

**Capa aplicación:** obvia, pero debe responder con mensaje útil al usuario antes de llegar a la DB.

Si en el futuro el Bosque agrega `@post.unbosque.edu.co` u otros subdominios, se puede flexibilizar. Por ahora estricto.

#### 7. Stale JWT después de cambio de roles

Riesgo real: JWT expira en 7 días. Si quitas el rol `teacher` a alguien, sigue teniendo los permisos hasta que su JWT expire.

**Opciones:**
- **(A) Acortar TTL del JWT** a 24h — simple, pero impacta UX (logins frecuentes).
- **(B) Refresh tokens** — JWT de 15min + refresh token de 7d almacenado en DB. Revocable. Más código.
- **(C) Consultar roles en cada request** — JWT solo identifica, roles vienen de DB en cada petición. Simple, añade una query por request.

**Recomendación para esta etapa:** **opción C con cache**. En el middleware de auth:
```
1. Validar JWT (identifica al usuario)
2. Cargar roles del usuario (query rápida con JOIN)
3. Inyectar roles en req.user
```

Una query trivial por request es aceptable (<1ms con índices). Cuando el sistema crezca, se agrega cache Redis.

#### 8. Política de eliminación de profesores

Si un profesor es removido del sistema, sus estudiantes quedan sin profesor. El `ON DELETE CASCADE` en `teacher_students` borra la relación, pero los estudiantes quedan huérfanos.

**Propongo:** al eliminar un profesor, mostrar en UI cuántos estudiantes tiene asignados, y exigir reasignación antes de borrar (capa de aplicación, no DB).

## Schema final propuesto

```sql
-- 1. Roles (sistema)
CREATE TABLE roles (
  id SMALLINT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (id, name, description, is_system) VALUES
  (1, 'admin',   'Superusuario del sistema',      TRUE),
  (2, 'teacher', 'Profesor con estudiantes',      TRUE),
  (3, 'student', 'Estudiante de la galería',      TRUE);

-- 2. Asignación de roles a usuarios (M:N)
CREATE TABLE user_roles (
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id     SMALLINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);

-- 3. Relación profesor-estudiante (M:N con cohort)
CREATE TABLE teacher_students (
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cohort      TEXT,
  PRIMARY KEY (teacher_id, student_id)
);
CREATE INDEX idx_teacher_students_student ON teacher_students(student_id);

-- 4. Trigger para validar que teacher_id tenga rol teacher
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

-- 5. Password reset tokens (hasheados)
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

-- 6. Validación dominio institucional
ALTER TABLE profiles
  ADD CONSTRAINT email_domain_check
  CHECK (email IS NULL OR email ~ '^[^@]+@unbosque\.edu\.co$');

-- 7. Migración de role → user_roles
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT
  p.id,
  CASE p.role
    WHEN 'admin' THEN 1
    WHEN 'teacher' THEN 2
    WHEN 'student' THEN 3
  END,
  NULL  -- histórico, sin auditoría
FROM profiles p;

-- Carlos es admin Y teacher
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT id, 2, id FROM profiles WHERE email = 'calmeydar@unbosque.edu.co';

-- 8. Drop columna role después de verificar
-- ALTER TABLE profiles DROP COLUMN role;
-- (hacerlo en una migración SEPARADA tras confirmar que todo funciona)
```

## Orden de ejecución recomendado

1. **Backup full de la DB** antes de cualquier cambio (pg_dump en el droplet).
2. Ejecutar schema nuevo en **transacción** (BEGIN/COMMIT).
3. Verificar que `user_roles` tenga una fila por cada `profiles.role` existente.
4. **Desplegar backend** con lógica nueva leyendo `user_roles` pero con fallback a `profiles.role` (migración soft, feature flag).
5. Tras 48h sin errores, **drop** de `profiles.role`.
6. Documentar en `docs/contexto-proyecto.md`.

## Riesgos y mitigaciones

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Dejamos sin admins al sistema | Crítico | Trigger que impide borrar último admin |
| Stale JWT con roles obsoletos | Medio | Opción C: cargar roles en cada request |
| Email con dominio equivocado pasa a DB | Bajo | CHECK constraint + validación app |
| Token de reset robado | Medio | Hash SHA-256, expiración 1h, single-use |
| Trigger de validación teacher falla silenciosamente | Bajo | Test en CI + logs |

## Pendientes para discutir con el equipo

1. **¿Cuándo dropear `profiles.role`?** Propongo 48h tras migración exitosa.
2. **¿Cron de limpieza de tokens vencidos?** Propongo semanal.
3. **¿Dashboard de auditoría?** Ver quién asignó qué rol, cuándo, a quién — útil para admin. Puede ser v2.
4. **Rate limiting en `/forgot-password`**: evitar spam del email del usuario — responsabilidad del skill de backend (Sebastián).

## Aprobación

Si el equipo valida, este schema queda listo para que Sebastián implemente el backend. Mi recomendación es arrancar Sprint 1 con la migración DB primero, en una ventana de bajo tráfico.

— Diego
