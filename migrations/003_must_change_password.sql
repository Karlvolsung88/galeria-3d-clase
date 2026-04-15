-- =============================================================================
-- Migración 003 — Flag must_change_password
-- Autor: Claude Renard (Tech Lead) — 2026-04-15
-- =============================================================================
-- Contexto: Plan C operativo. El admin genera passwords temporales desde /admin
-- (creación o reset manual). El estudiante debe forzadamente cambiar esa
-- password a una de su elección al primer login. Este flag controla el modal
-- forzado en el frontend.
--
-- Semántica:
--   - true  → login devuelve flag, frontend abre modal obligatorio
--   - false → login normal
--
-- Valores iniciales:
--   - Usuarios existentes (8 perfiles en prod) → false: ellos ya eligieron
--     su password (auto-registro) o la recibirán por reset manual posterior
--     (el reset pone el flag a true).
--   - Nuevos usuarios creados por admin → true (lo setea el endpoint).
--   - Self-service register → false (el usuario eligió la password).
--
-- Uso en prod (después de QA local):
--   psql --single-transaction -f migrations/003_must_change_password.sql
-- =============================================================================

BEGIN;

ALTER TABLE profiles
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.must_change_password IS
  'true cuando admin generó password temporal. Frontend fuerza modal de cambio al login. Se pone en false al completar el cambio.';

-- Validación: todos los existentes arrancan en false (ninguno forzado)
DO $$
DECLARE
  forced_count INTEGER;
BEGIN
  SELECT count(*) INTO forced_count
  FROM profiles WHERE must_change_password = true;

  IF forced_count != 0 THEN
    RAISE EXCEPTION 'Usuarios existentes no deben tener flag forzado: encontré %', forced_count;
  END IF;

  RAISE NOTICE 'Migración 003 OK — columna creada, 0 usuarios forzados.';
END $$;

COMMIT;
