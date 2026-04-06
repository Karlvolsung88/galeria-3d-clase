# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Corregido

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
