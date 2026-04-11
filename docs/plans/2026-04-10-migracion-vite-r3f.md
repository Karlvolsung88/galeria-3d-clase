# Plan: Migración Astro → Vite + React + R3F

**Estado**: implementado
**Creado**: 2026-04-10
**Implementado**: 2026-04-10 (develop)

## Contexto
Astro 6 MPA causa problemas de renderización WebGL/SVG al navegar entre páginas (bfcache, prefetch). La galería necesita navegación SPA para que los modelos 3D y gráficos persistan. Se migra a Vite + React + React Router + React Three Fiber.

## Principios
- **Supabase intacto**: auth, storage, DB, RLS — cero cambios backend
- **Reutilizar componentes**: los 13 componentes React no dependen de Astro
- **R3F reemplaza model-viewer**: mejor control, centrado automático, iluminación studio
- **GitHub Pages**: SPA routing con 404.html trick

## Tareas

### Fase 1: Estructura del proyecto
- [x] Crear proyecto Vite + React en la raíz (reemplazar astro.config.mjs por vite.config.js)
- [x] Actualizar package.json: quitar astro/@astrojs, agregar react-router-dom, @react-three/fiber, @react-three/drei
- [x] Crear index.html en raíz (entry point SPA)
- [x] Crear src/main.tsx (mount React app)
- [x] Crear src/App.tsx con React Router (rutas: /, /estudiantes, /perfil)
- [x] Crear src/layouts/Layout.tsx (top bar + nav + outlet)

### Fase 2: Migrar componentes (sin cambios funcionales)
- [x] Mover supabase.ts tal cual
- [x] Mover Gallery.tsx, EstudiantesPage.tsx, ProfilePage.tsx (page components)
- [x] Mover AuthModal, UserMenu, UploadForm, EditModelForm, SkillsEditor
- [x] Mover StudentCard, HexagonChart
- [x] Mover global.css (ajustar imports)

### Fase 3: Reemplazar model-viewer con R3F
- [x] Crear componente Model3D.tsx (useGLTF + centrado + color space fix)
- [x] Crear componente ModelScene.tsx (environment, suelo, shadows, lights)
- [x] Actualizar ModelCard.tsx → usar Canvas + Model3D (estático 3/4, hover rotate)
- [x] Actualizar ModelModal.tsx → usar Canvas + Model3D (controles completos)
- [x] Actualizar UploadForm.tsx → preview con R3F en vez de model-viewer
- [x] Actualizar EditModelForm.tsx → preview con R3F
- [x] Eliminar script model-viewer de Layout

### Fase 4: SortableModelCard + DnD
- [x] Adaptar SortableModelCard para nuevo ModelCard con R3F

### Fase 5: Deploy
- [x] Actualizar vite.config.js con base: '/galeria-3d-clase'
- [x] Crear public/404.html para SPA routing en GitHub Pages
- [x] Actualizar .github/workflows/deploy.yml para Vite build
- [x] Verificar build: npm run build
- [x] Deploy a producción

### Fase 6: Limpieza
- [x] Eliminar archivos Astro (src/pages/*.astro, src/layouts/Layout.astro, astro.config.mjs)
- [x] Eliminar dependencias Astro del package.json
- [x] Eliminar demo-r3f/
- [x] Actualizar CHANGELOG.md
- [x] Actualizar README.md

## Archivos a modificar/crear
- `vite.config.js` — nuevo, reemplaza astro.config.mjs
- `index.html` — nuevo, entry point SPA
- `src/main.tsx` — nuevo, mount React
- `src/App.tsx` — nuevo, React Router
- `src/layouts/Layout.tsx` — nuevo, reemplaza Layout.astro
- `src/components/Model3D.tsx` — nuevo, componente R3F reutilizable
- `src/components/ModelScene.tsx` — nuevo, escena 3D con luces/suelo
- `src/components/ModelCard.tsx` — modificar (model-viewer → R3F)
- `src/components/ModelModal.tsx` — modificar (model-viewer → R3F)
- `src/components/UploadForm.tsx` — modificar (preview model-viewer → R3F)
- `src/components/EditModelForm.tsx` — modificar (preview model-viewer → R3F)
- `src/components/Gallery.tsx` — modificar menor (quitar console.logs restantes)
- `src/styles/global.css` — ajustar imports
- `public/404.html` — nuevo, SPA routing GitHub Pages
- `.github/workflows/deploy.yml` — modificar para Vite

## Riesgos
- SPA routing en GitHub Pages requiere hack 404.html (bien documentado)
- 13 Canvas WebGL simultáneos — probado en demo, funciona con frameloop="demand"
- @dnd-kit compatibilidad con nuevo ModelCard — debe funcionar igual (wrapper)
