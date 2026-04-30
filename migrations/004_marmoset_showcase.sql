-- =============================================================================
-- Migración 004 — Marmoset Showcase (mview_url + mview_thumbnail_url)
-- Autor: Claude Renard (Tech Lead) — 2026-04-29
-- =============================================================================
-- Contexto: feature v3.3.0. Cada modelo del estudiante (.glb) puede tener
-- opcionalmente una versión "Showcase" en formato .mview (Marmoset Toolbag),
-- subida por un docente (admin o teacher) como muestra técnica de la pieza
-- procesada con materiales PBR avanzados y lighting profesional.
--
-- Concepto clave: el .mview NO es un modelo independiente, es un complemento
-- de la fila existente en `models`. Una fila → dos vistas posibles del mismo
-- trabajo (estudiante / showcase docente).
--
-- Semántica:
--   - mview_url IS NULL           → el modelo solo tiene la versión .glb del estudiante
--   - mview_url IS NOT NULL       → el modelo tiene Showcase, frontend muestra carrusel
--   - mview_thumbnail_url         → poster manual (.png/.jpg) que sube el docente
--                                    (Marmoset no genera poster automático con .mview)
--
-- Reversibilidad: ambos campos son NULL por default, nada se rompe si se hace
-- ROLLBACK del feature en frontend — los modelos seguirían funcionando con .glb.
--
-- Uso en prod (después de QA local + aprobación):
--   sudo -u postgres psql -d galeria_3d --single-transaction -f migrations/004_marmoset_showcase.sql
-- =============================================================================

BEGIN;

ALTER TABLE models
  ADD COLUMN mview_url TEXT NULL,
  ADD COLUMN mview_thumbnail_url TEXT NULL;

COMMENT ON COLUMN models.mview_url IS
  'URL CDN del archivo .mview (Marmoset Toolbag) si el modelo tiene Showcase. NULL = solo .glb.';
COMMENT ON COLUMN models.mview_thumbnail_url IS
  'URL CDN del poster manual del Showcase (.png/.jpg subido por el docente). NULL si no hay Showcase.';

-- Validación: todos los modelos existentes arrancan sin Showcase
DO $$
DECLARE
  showcase_count INTEGER;
  total_models   INTEGER;
BEGIN
  SELECT count(*) INTO total_models   FROM models;
  SELECT count(*) INTO showcase_count FROM models WHERE mview_url IS NOT NULL;

  IF showcase_count != 0 THEN
    RAISE EXCEPTION 'Modelos existentes no deben tener mview_url: encontré %', showcase_count;
  END IF;

  RAISE NOTICE 'Migración 004 OK — columnas creadas. Total modelos: %, con showcase: 0.', total_models;
END $$;

COMMIT;
