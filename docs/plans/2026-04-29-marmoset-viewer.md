---
autor: Claude Renard
cargo: Líder de Desarrollo / Tech Lead
fecha: 2026-04-29
tema: Integración de Marmoset Viewer + sección Showcase (v3.3.0)
estado: en_revision
---

# Plan v3.3.0 — Marmoset Viewer + Sección Showcase

**Estado**: sin_implementar
**Creado**: 2026-04-29
**Implementado**: (pendiente)

## Objetivo de negocio

Permitir que docentes (admin + teacher) curen una **biblioteca de assets 3D de calidad técnica** mostrados con Marmoset Viewer (mismo visor que usa ArtStation en perfiles de artistas). Estos modelos forman una sección "Showcase / Trabajos destacados" separada de la galería general, comunicando estándar técnico al visitante.

## Decisiones tomadas (con Carlos)

| Decisión | Resuelto |
|---|---|
| Formatos soportados | Solo `.mview` (KISS, no FBX/USDZ/Sketchfab) |
| Quién puede subir `.mview` | Admin + teacher (no estudiantes) |
| Thumbnails | Campo separado `.png/.jpg` obligatorio (Marmoset no genera poster) |
| **Modelo conceptual** ⭐ | El `.mview` es **complemento del `.glb`** del estudiante (mismo modelo, dos vistas). NO es una galería separada. |
| Schema DB | Migración 004 con 2 columnas nullables: `mview_url` + `mview_thumbnail_url` |
| UI subida `.mview` | Botón en la card de la galería (estilo botón "borrar") con ícono Marmoset, visible solo para admin/teacher |
| Default al abrir modal | Marmoset (Showcase) primero — fallback a `.glb` si no existe |
| Switch entre vistas | **Carrusel animado** (no tabs ni botones planos) — es un programa de Creación Digital |
| Visibilidad | Cards en galería tienen badge sutil ⭐ si hay Showcase. Sin ruta separada. |

## Equipo

| Rol | Sprint(s) |
|---|---|
| **Sebastián Torres** (Senior Dev) | 1, 2, 3 — backend + viewer + integración |
| **Isabella Moreno** (Frontend 3D) | 4 — UX sección Showcase + badge cards |
| **Diego Ramírez** (Data Lead) | 1 — auditar RBAC en endpoint upload |
| **Andrés Cano** (Testing) | 5 — QA local + verificación 403 + smoke prod |
| **Mateo Gutiérrez** (DevOps) | 5 — deploy droplet + tag |
| **Claude Renard** (Tech Lead) | Coordinación + commits + session log |

## Sprints (Scrumban WIP:1) — REPLAN POST DECISIONES

| # | Sprint | Estado | Commit |
|---|---|---|---|
| 1 | Foundation (marmoset.js + multer fileFilter + RBAC handler) | ✅ hecho | d5b39ee |
| 2 | MarmosetViewer component + ruta `/test-marmoset` (QA visual) | ✅ hecho | d5b39ee |
| 3 | Migración 004 + endpoint enrichment `POST /api/models/:id/showcase` | ✅ hecho | d5b39ee |
| 4 | ModelModal con carrusel flip .glb ↔ .mview | ✅ hecho — caso real AK47 Andrea Rozo | d5b39ee |
| 5 | Botón "+ Showcase" en card + form upload (con PROTOTYPE_GUARD) | ✅ hecho — Carlos confirmó | 33fd766 |
| 6 | Badge ⭐ en cards con Showcase + filtro opcional | ⏸ pendiente — siguiente sesión | — |
| 7 | Cleanup TestMarmoset + activar guard + QA + deploy v3.3.0 | ⏸ pendiente | — |

---

## ✋ Estado al cerrar sesión 2026-04-29 (noche)

**Lo que funciona en local:**
- Backend `localhost:3000` con multer + endpoints showcase + RBAC admin/teacher
- Frontend `localhost:5173` con carrusel flip 3D + form upload + botón en cards
- Sandbox `public/test-models/`: `Bourgelon.mview` (1.95 MB) + `AK47_Andrea.mview` (6.9 MB)
- DB local `galeria_3d_local`: AK47 de Andrea Rozo (id `62001d05-5609-4f69-bb81-c32780ad60b0`) tiene `mview_url='/test-models/AK47_Andrea.mview'`

**Restricciones de prototipo aún activas (intencionales):**
- `PROTOTYPE_GUARD = true` en `ShowcaseUploadForm.tsx` — submit valida pero NO sube al bucket
- `vite.config.ts` debe revertirse a localhost cada sesión (sin commit nunca)
- `/test-marmoset` ruta de debug en App.tsx — eliminar antes de deploy

**Pendientes técnicos abiertos:**
- Animación del flip se siente "horrible" según Carlos pero queda funcional. Pulido cinematográfico fue intentado y rompió `preserve-3d`. Pendiente: explorar enfoque alternativo (cross-fade con depth, slide, etc.) en sesión futura — fuera del alcance actual.
- Modelos `.mview` con cámara descentrada en exportación — documentar guideline al docente (Sprint 7 incluirá runbook básico).

## 📋 Sprint 6 — siguiente sesión (mañana)

**Objetivo:** que el visitante identifique de un vistazo qué modelos tienen versión Showcase, opcionalmente con filtro.

Tareas:
- [ ] **Badge** en `ModelCard` cuando `hasShowcase=true`. Posición: esquina superior izquierda del thumbnail. Estilo: chip cian translúcido con ícono "M" + texto "Showcase". Animación sutil de aparición (pulse del glow).
- [ ] **CSS** `.card-showcase-badge` + animación.
- [ ] **Filtro toggle** "Solo Showcase" — decidir con Carlos: ¿categoría adicional junto a Todos/Personaje/etc., o switch independiente?
- [ ] Si filtro: extender state `activeFilter` o agregar `showcaseOnly: boolean` en Gallery.

**Archivos a tocar:**
- `src/components/ModelCard.tsx` (badge JSX)
- `src/styles/global.css` (estilos badge)
- `src/components/Gallery.tsx` (filtro, si va)

## 🚀 Sprint 7 — deploy v3.3.0

Tareas (no antes de aprobar Sprint 6):
- [ ] Eliminar `src/pages/TestMarmoset.tsx` y la ruta `/test-marmoset` de `App.tsx`
- [ ] `PROTOTYPE_GUARD = false` en `ShowcaseUploadForm.tsx`
- [ ] Bump `package.json` 3.2.1 → 3.3.0
- [ ] `[Unreleased]` → `[3.3.0] — fecha` en CHANGELOG
- [ ] `npm run build` clean
- [ ] **Backups prod** (DB + server.js + frontend)
- [ ] **Migración 004** en prod (como `postgres`, single-transaction)
- [ ] **scp** `backend/server.js` + `pm2 restart galeria-api`
- [ ] **scp** `dist/*` + `public/marmoset.js`
- [ ] Restaurar `vite.config.ts` a prod ANTES del commit final
- [ ] Push develop → merge main → tag `v3.3.0` → push tags
- [ ] Vuelta a develop + sync (regla 2.6)
- [ ] QA prod: Carlos sube .mview real desde admin a un modelo de prueba
- [ ] Session log

## 🔁 Comando para retomar mañana

1. `git status` → debe estar limpio en `develop` (commit `33fd766` o más reciente)
2. Editar `vite.config.ts`: `API_TARGET='http://localhost:3000'`, `API_SECURE=false` (NO commit)
3. Terminal 1: `cd backend && node server.js`
4. Terminal 2: `npm run dev`
5. Verificar http://localhost:5173 + click "ak47" de Andrea → debe ver carrusel funcional
6. Arrancar Sprint 6 siguiendo el plan de arriba

---

### Sprint 1 — Foundation (backend + script) ✅ HECHO
- [ ] Descargar `marmoset.js` v4.0+ oficial desde marmoset.co → `public/marmoset.js` (servido como asset estático)
- [ ] `backend/server.js`:
  - [ ] Multer: aceptar `.mview` además de `.glb/.gltf` en filter
  - [ ] `POST /api/models`: detectar extensión, si es `.mview` aplicar `requireRole(['admin','teacher'])` (Diego audita)
  - [ ] Validar tamaño máximo (mantener actual, ~50MB margen sobre el 1.95MB del Bourgelon real)
- [ ] Verificar `client_max_body_size 100M` en nginx ya existe ✅

### Sprint 2 — MarmosetViewer component
- [ ] `src/components/MarmosetViewer.tsx`:
  - Lazy-load del script `/marmoset.js` (una sola vez por sesión, cached)
  - Monta `<canvas>` con `marmoset.embed(url, options)`
  - Cleanup en unmount
  - Loading state mientras descarga el `.mview`
- [ ] `src/components/ModelModal.tsx`: switch
  ```tsx
  {file_url.endsWith('.mview')
    ? <MarmosetViewer url={file_url} />
    : <Canvas>...</Canvas>}
  ```

### Sprint 3 — Upload UX (UploadForm)
- [ ] `src/components/UploadForm.tsx`:
  - `accept=".glb,.gltf,.mview"`
  - Detectar extensión seleccionada
  - Si `.mview`:
    - Ocultar `<Canvas>` + `<ThumbnailCapture>` (no aplica)
    - Mostrar campo nuevo: **"Imagen de portada (.png/.jpg) *"** obligatorio (input file separado)
    - Reusar lógica de `formData.append('thumbnail', ...)` existente
  - Si `.glb`: flujo actual sin cambios
- [ ] Verificar que `getCurrentUser()?.roles` incluye admin/teacher antes de habilitar `.mview` en accept (gate cliente, redundante con backend)

### Sprint 4 — Sección Showcase (Isabella)
- [ ] Nueva ruta `/showcase` con su componente `Showcase.tsx`
- [ ] Endpoint: reusar `GET /api/models` y filtrar `file_url.endsWith('.mview')` en cliente (o agregar query param `?viewer=mview`)
- [ ] Card grid similar a galería principal pero con badge **"⭐ Showcase"** (estilo distintivo)
- [ ] Link al `/showcase` desde el topbar nav (entre "Galería" y "Estudiantes")
- [ ] CSS: tarjetas con borde acento u overlay sutil que comunique "destacado"

### Sprint 5 — QA + Deploy (Andrés + Mateo)
- [ ] **QA local**:
  - Subir `Bourgelon.mview` desde admin → debe renderizar
  - Verificar viewer funcional (rotar, zoom, materiales PBR visibles)
  - Login como student → intentar subir `.mview` → debe fallar 403
  - Login como teacher → debe poder subir
  - `/showcase` lista solo `.mview`, galería principal lista solo `.glb`
- [ ] **Build**: `npm run build` sin errores ni warnings nuevos
- [ ] **Deploy**:
  - Backup prod DB + frontend + backend
  - `scp public/marmoset.js` + `dist/*` al droplet
  - `scp backend/server.js` + `pm2 restart galeria-api`
  - Smoke prod: subir Bourgelon real, verificar render
- [ ] Tag `v3.3.0` + push tags

## Archivos a modificar / crear

| Archivo | Acción |
|---|---|
| `public/marmoset.js` | **NUEVO** — script oficial Marmoset (~150KB) |
| `backend/server.js` | Modificar multer + RBAC en /api/models |
| `src/components/MarmosetViewer.tsx` | **NUEVO** — componente viewer |
| `src/components/ModelModal.tsx` | Switch por extensión |
| `src/components/UploadForm.tsx` | Aceptar `.mview` + thumbnail manual |
| `src/pages/Showcase.tsx` | **NUEVO** — sección destacados |
| `src/App.tsx` (router) | Ruta `/showcase` |
| `src/layouts/Layout.tsx` | Link "Showcase" en topbar |
| `src/index.css` (o equivalente) | Estilos badge Showcase |
| `CHANGELOG.md` | Entrada `[3.3.0]` |
| `package.json` | Bump 3.2.1 → 3.3.0 |

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Script `marmoset.js` cambia API en versión futura | Fijar versión específica al descargar (semver), commitearlo en repo |
| `.mview` muy grande podría timeout en upload | Límite probado con archivo real (1.95MB) — margen amplio |
| Chrome bloquea WebGL en algún device | Fallback message "este modelo requiere WebGL" |
| Estudiante encuentra forma de subir `.mview` por API directa | Backend valida con `requireRole`, no solo UI |

## Out of scope (NO hacer en este plan)

- ❌ FBX, USDZ, Sketchfab embed
- ❌ Conversión automática `.mview` → `.glb` o viceversa
- ❌ Editor de cámara/luz dentro del viewer (Marmoset ya trae sus controles)
- ❌ Sistema de "likes" o comentarios diferenciado para Showcase (reusar el actual)
- ❌ Migración DB (detección por extensión es suficiente)

## Estimación

- Sprint 1: 30 min
- Sprint 2: 45 min
- Sprint 3: 30 min
- Sprint 4: 60 min
- Sprint 5: 45 min
- **Total: ~3.5 horas + QA**

## Tag de release

`v3.3.0` — minor bump (feature nueva sin breaking changes).
