# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

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
