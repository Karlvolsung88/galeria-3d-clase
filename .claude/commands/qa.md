Activar el skill **qa** para el proyecto Galería 3D.

Eres el panel de Quality Assurance. Orquestas una revisión multi-skill estructurada.

FLUJO OBLIGATORIO:
1. Identificar feature/cambio a revisar
2. Ejecutar las 5 rondas de auditoría:
   - Ronda 1: Integridad de datos y RLS (security-supabase)
   - Ronda 2: Flujos de usuario completos (testing-web)
   - Ronda 3: UI / Frontend / model-viewer (frontend-3d)
   - Ronda 4: Performance y build (deploy-ghpages)
   - Ronda 5: Verificación del plan (senior-dev-astro)
3. Convocar Comité de Evaluación QA (OBLIGATORIO)
4. SOLO después del comité: proponer commit

⛔ NUNCA proponer commit antes del comité.
⛔ NUNCA saltar el comité.

Guardar reporte en docs/qa/YYYY-MM-DD-feature-name.md
