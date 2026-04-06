# Plan: Página de Perfiles y Habilidades de Estudiantes
**Estado**: en_progreso
**Creado**: 2026-04-06
**Implementado**: (pendiente)

## Resumen
Nueva página `/estudiantes` con grid de perfiles, radar chart hexagonal SVG de 6 habilidades, y modelos del estudiante. El admin carga habilidades desde un editor integrado en la misma página.

## Tareas

### Fase 1 — Supabase (manual en Studio)
- [x] SQL de tabla `student_skills` + RLS entregado al usuario

### Fase 2 — Backend
- [ ] Interface `StudentSkill` en supabase.ts
- [ ] Constante `SKILLS` con los 6 nombres canónicos
- [ ] `fetchAllStudentsWithSkills()`
- [ ] `fetchStudentSkills(userId)`
- [ ] `upsertStudentSkills(userId, skills)`

### Fase 3 — HexagonChart.tsx
- [ ] SVG con grid de 3 hexágonos concéntricos
- [ ] Ejes y labels por habilidad
- [ ] Polígono de datos animado
- [ ] Estado vacío (sin datos)

### Fase 4 — StudentCard.tsx
- [ ] Avatar con iniciales
- [ ] HexagonChart integrado
- [ ] Thumbnails de modelos (model-viewer lazy)
- [ ] Estado vacío de habilidades

### Fase 5 — SkillsEditor.tsx
- [ ] Dropdown selector de estudiante
- [ ] 6 sliders con label y valor
- [ ] Guardar con upsertStudentSkills
- [ ] Feedback visual

### Fase 6 — estudiantes.astro
- [ ] Página con Layout base
- [ ] Grid de StudentCard
- [ ] SkillsEditor solo para admin
- [ ] Link desde index.astro

## Archivos a modificar/crear
- `src/lib/supabase.ts` — nuevas interfaces y helpers
- `src/components/HexagonChart.tsx` — nuevo
- `src/components/StudentCard.tsx` — nuevo
- `src/components/SkillsEditor.tsx` — nuevo
- `src/pages/estudiantes.astro` — nuevo
- `src/pages/index.astro` — agregar link de navegación
