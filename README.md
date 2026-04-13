# Galería 3D — Estudio de Creación Digital 4

Galería web interactiva de modelos 3D creados por estudiantes de la Universidad El Bosque.

## Stack

| Capa | Tecnología |
|------|-----------|
| **Frontend** | Vite 6 + React 19 + React Router 7 |
| **3D** | Three.js + React Three Fiber + Drei |
| **Backend** | Node.js + Express + PostgreSQL (DigitalOcean Droplet) |
| **Storage** | DigitalOcean Spaces (S3-compatible CDN) |
| **Auth** | JWT custom (bcryptjs + jsonwebtoken) |
| **Styling** | CSS custom (dark + neubrutalism) |
| **Deploy** | Nginx + SSL (Let's Encrypt) en DigitalOcean Droplet |
| **Dominio** | `ceopacademia.org` (Hostinger → NS DigitalOcean) |

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│  Browser (SPA)                                          │
│  Vite + React 19 + R3F + Three.js                       │
│  ───────────────────────────────────────                │
│  /api/*  → Express API (JWT auth)                       │
│  /cdn/*  → Nginx proxy → DO Spaces CDN                  │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTPS
┌─────────────────▼───────────────────────────────────────┐
│  DigitalOcean Droplet — ceopacademia.org                │
│  ┌─────────────────────────────────────────────┐        │
│  │  Nginx (80 → 301 HTTPS, 443 SSL)           │        │
│  │  ├─ /        → static frontend (dist/)      │        │
│  │  ├─ /api/    → proxy → Node.js :3000        │        │
│  │  └─ /cdn/    → proxy → DO Spaces CDN        │        │
│  └─────────────────────────────────────────────┘        │
│  ┌─────────────────────────────────────────────┐        │
│  │  Node.js + Express (PM2, puerto 3000)       │        │
│  │  ├─ Auth: JWT (bcryptjs + jsonwebtoken)     │        │
│  │  ├─ DB: PostgreSQL 16 (local)               │        │
│  │  └─ Storage: DO Spaces via AWS SDK S3       │        │
│  └─────────────────────────────────────────────┘        │
│  ┌─────────────────────────────────────────────┐        │
│  │  PostgreSQL 16                              │        │
│  │  ├─ profiles (admin/student, bcrypt hash)   │        │
│  │  ├─ models (GLB metadata, /cdn/ URLs)       │        │
│  │  ├─ likes, comments, student_skills         │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│  DigitalOcean Spaces (galeria-3d-files)                 │
│  ├─ models/*.glb          (archivos 3D)                 │
│  └─ thumbnails/*.webp     (720x405, WebP 0.85)          │
│  CDN: galeria-3d-files.nyc3.cdn.digitaloceanspaces.com  │
└─────────────────────────────────────────────────────────┘
```

## Características

- Galería con grid responsivo y filtros por categoría (personaje, vehículo, criatura, objeto)
- Visor 3D interactivo con React Three Fiber (orbit, zoom, pan)
- Thumbnails 720x405 (16:9, calidad Sketchfab) generados client-side
- Loading estilo Sketchfab: thumbnail como placeholder + crossfade al modelo 3D
- Code splitting: Three.js (~847KB) lazy-loaded on-demand
- Sistema de likes y comentarios
- Drag & drop para reordenar modelos (admin)
- Upload de modelos GLB con preview 3D
- Página de estudiantes con radar chart SVG de habilidades
- Auth JWT con roles admin/student
- Dark theme con tipografías Bebas Neue + JetBrains Mono

## Desarrollo local

```bash
npm install
npm run dev          # http://localhost:5173 (proxy a ceopacademia.org)
npm run build        # Build producción en dist/
```

El proxy de Vite redirige `/api` y `/cdn` a `https://ceopacademia.org`.

## Deploy a producción

```bash
npm run build
scp -r dist/* root@159.203.189.167:/var/www/galeria-frontend/
```

## Categorías de modelos

`personaje` | `vehiculo` | `criatura` | `objeto`

## Skills de estudiantes

`modelado_3d` | `escultura` | `uv_mapping` | `texturizado_pbr` | `optimizacion` | `renderizado`

## Roles

- **admin** — Profesor: gestión total (CRUD modelos, skills, perfiles, reorder, thumbnails)
- **student** — Estudiante: sus modelos, su perfil, likes, comentarios
- **visitante** — Sin auth: solo lectura

## Ramas

- `develop` — desarrollo diario
- `main` — solo merges de release para producción
