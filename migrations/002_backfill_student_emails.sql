-- =============================================================================
-- Migración 002 — Backfill de emails institucionales para estudiantes
-- Autor: Claude Renard (Tech Lead) — 2026-04-14
-- =============================================================================
-- Contexto: los 7 estudiantes migrados desde producción no tenían email en la
-- columna `profiles.email` (vinieron vacíos del dump). Sin email, el Sprint 4
-- (password reset) no puede enviar tokens. Esta migración backfillea los
-- correos institucionales provistos por el docente Carlos E Almeyda.
--
-- Validaciones:
--   - Todos los emails terminan en `@unbosque.edu.co` (CHECK
--     email_domain_check pasa).
--   - Se matchean por `full_name` exacto tal como están en DB.
--   - El matching se verifica con un conteo antes de COMMIT.
--
-- Uso en prod (Fase 2): ejecutar este archivo con
--   psql --single-transaction -f migrations/002_backfill_student_emails.sql
-- después del backup y después de la migración 001.
-- =============================================================================

BEGIN;

-- Backfill por nombre exacto (tal como aparece en DB local y prod)
UPDATE profiles SET email = 'acrozo@unbosque.edu.co'        WHERE full_name = 'Andrea Rozo';
UPDATE profiles SET email = 'aclarosb@unbosque.edu.co'      WHERE full_name = 'ANDRES CLAROS';
UPDATE profiles SET email = 'dcrodriguezz@unbosque.edu.co'  WHERE full_name = 'Daniel Rodriguez';
UPDATE profiles SET email = 'jaospinab@unbosque.edu.co'     WHERE full_name = 'Johan Ospina';
UPDATE profiles SET email = 'lmsierram@unbosque.edu.co'     WHERE full_name = 'Laura Sierra';
UPDATE profiles SET email = 'parias@unbosque.edu.co'        WHERE full_name = 'Paula Andrea Arias Mora';
UPDATE profiles SET email = 'sparadam@unbosque.edu.co'      WHERE full_name = 'samuel parada';

-- Validación: los 7 estudiantes objetivo ahora tienen email no-nulo
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM profiles
  WHERE full_name IN (
    'Andrea Rozo', 'ANDRES CLAROS', 'Daniel Rodriguez',
    'Johan Ospina', 'Laura Sierra', 'Paula Andrea Arias Mora', 'samuel parada'
  ) AND email IS NOT NULL;

  IF v_count <> 7 THEN
    RAISE EXCEPTION 'Backfill incompleto: % de 7 estudiantes con email', v_count;
  END IF;

  RAISE NOTICE 'Backfill OK: 7/7 estudiantes con email institucional';
END $$;

COMMIT;
