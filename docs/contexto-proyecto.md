# Contexto del Proyecto — Galería 3D

> **Para Claude en cualquier dispositivo:** Lee este archivo al inicio de cada sesión.
> Es la fuente de verdad portable del proyecto. Complementa `CLAUDE.md`.
> Última actualización: 2026-04-13

---

## El Usuario

Profesor de la clase **"Estudio de Creación Digital 4"** — Universidad El Bosque.
- Comunica en español.
- Gestiona una galería web de modelos 3D (GLB) creados por sus estudiantes.
- Interesado en experiencias web 3D y futuras implementaciones AR/VR.
- Prefiere respuestas cortas y directas. No le gustan los parches improvisados — exige análisis antes de implementar.
- Cuando pide "la mesa de desarrollo", quiere el flujo completo con especialistas nombrados y aprobación del equipo.

---

## El Proyecto

**Galería web** para que estudiantes de diseño digital exhiban sus modelos 3D.

| Campo | Valor |
|-------|-------|
| **Frontend** | Vite 6 + React 19 + React Router 7 |
| **3D** | Three.js + React Three Fiber + Drei |
| **Backend** | Node.js + Express (DigitalOcean Droplet) |
| **Database** | PostgreSQL 16 (local en droplet) |
| **Storage** | DigitalOcean Spaces (S3 CDN) |
| **Auth** | JWT custom (bcryptjs + jsonwebtoken) |
| **Styling** | CSS custom (dark + neubrutalism) |
| **Deploy** | Nginx en Droplet (159.203.189.167) |
| **Repo** | `Karlvolsung88/galeria-3d-clase` |
| **URL prod** | http://159.203.189.167 (pendiente: ceopacademia.org) |
| **Semestre** | 2026-1 |

### Ramas
- `develop` — TODO el desarrollo diario
- `main` — solo recibe merges para producción. Nunca desarrollar directo en main.

### Base de datos (PostgreSQL en droplet)
```
profiles       (id UUID, full_name, role, email, password_hash, bio, artstation_url, instagram_url)
models         (id, title, student, category, tags[], file_name, file_url, file_size, user_id → profiles, sort_order, thumbnail_url)
student_skills (user_id → profiles, skill_name, value 0-100)
likes          (user_id → profiles, model_id → models)
comments       (user_id → profiles, model_id → models, text)
```

### API Client
El frontend usa `src/lib/api.ts` — un cliente REST puro con JWT auth.
NO se usa Supabase SDK. Todo pasa por `/api/*` (Express) y `/cdn/*` (Nginx proxy a DO Spaces).

### Categorías de modelos
`personaje | vehiculo | criatura | objeto`

### Skills de estudiantes
`modelado_3d | escultura | uv_mapping | texturizado_pbr | optimizacion | renderizado`

### Roles
- `admin` — Profesor: puede gestionar todo
- `student` — Estudiante: solo sus modelos
- visitante — Sin auth: solo lectura

---

## El Equipo (nombres FIJOS — siempre usar estos)

| Nombre | Cargo | Skill | Comando |
|--------|-------|-------|---------|
| **Claude Renard** | Líder de Desarrollo | *(yo)* | — |
| **Sebastián Torres Mejía** | Senior Dev React | `senior-dev-astro` | `/dev` |
| **Laura Botero Ríos** | Analista y Planificadora | `planner-analyst` | `/plan` |
| **Natalia Vargas Ospina** | Arquitecta Web | `software-architect-web` | `/architect` |
| **Isabella Moreno Ríos** | Diseñadora Frontend 3D | `frontend-3d` | `/frontend` |
| **Andrés Cano Herrera** | Especialista en Testing | `testing-web` | `/test` |
| **Diego Ramírez Castellanos** | Data Lead & Arquitecto de Datos | `security-supabase` | `/security` |
| **Mateo Gutiérrez Reyes** | DevOps / Deploy | `deploy-ghpages` | `/deploy` |
| **Valentina Soto Parra** | QA Lead | `qa` | `/qa` |
| **Felipe Vargas Montoya** | Especialista Browser & JavaScript | `browser-js-expert` | `/browser` |

---

## Decisiones Técnicas Importantes

### Por qué se migró de Supabase a DigitalOcean (2026-04-13)
Supabase Auth tenía un bug crítico: `signInWithPassword` retornaba HTTP 200 pero el SDK JS nunca resolvía la Promise en el navegador. Después de múltiples intentos de fix (timeout wrappers, disable realtime, etc.) se decidió migrar completamente a un stack propio: Express + PostgreSQL + DO Spaces + JWT. El login ahora responde en <100ms. Bundle reducido ~200KB al eliminar el SDK de Supabase.

### Arquitectura actual (post-migración)
```
Browser → Nginx (puerto 80)
  ├─ /          → archivos estáticos (dist/)
  ├─ /api/*     → proxy → Express :3000
  └─ /cdn/*     → proxy → DO Spaces CDN
```

Los archivos GLB y thumbnails están en DO Spaces pero se sirven via `/cdn/` (proxy Nginx) para evitar CORS.

### Thumbnails (720x405, WebP 0.85)
Generados client-side con React Three Fiber: ThumbnailGenerator renderiza cada modelo en un Canvas de 720x405px (ratio 16:9, igual que Sketchfab) con dpr=2, captura con toBlob y sube via API. El componente ThumbnailCapture espera 30 frames dentro de Suspense para asegurar que el modelo esté cargado.

### Por qué AuthModal usa createPortal
`#top-bar` tiene `backdrop-filter: blur(12px)` que crea un containing block para `position: fixed`. Sin `createPortal`, el modal queda posicionado relativo al top-bar. Fix: `createPortal(content, document.body)`.

---

## Estado del Proyecto (2026-04-13)

### Lo que está funcionando en producción
- Galería con 13 modelos 3D (React Three Fiber)
- Thumbnails 720x405 (calidad Sketchfab) para todos los modelos
- Filtros por categoría
- Sistema de likes y comentarios
- Auth JWT (admin/student/visitante)
- Upload de modelos GLB
- Drag & drop reorder (admin)
- Regeneración masiva de thumbnails (admin)
- Página /estudiantes con radar chart SVG
- Página /perfil
- Backend en DigitalOcean (Express + PostgreSQL + Spaces)
- Proxy CDN via Nginx (sin CORS)

### Bugs conocidos resueltos (no reabrir)
- Supabase login hanging → migrado a JWT custom
- ThumbnailCapture firing before model loads → dentro de Suspense
- Race condition auth → patrón await en init()
- Modal login descentrado → createPortal
- Reorder RLS error → update individual en vez de upsert

### Herramientas
- `gh` CLI **NO está instalado** en Windows. Usar `git` directamente.
- Build: `npm run build` — siempre antes de commit si se tocó UI
- Dev: `npm run dev` (proxy a droplet via vite.config.ts)

---

## Preferencias de Trabajo del Usuario

- **Análisis antes de código** — nunca implementar sin leer el código primero y pedir aprobación
- **Sin parches improvisados** — si algo falla 2 veces, parar y hacer auditoría
- **Commits frecuentes** — máximo 30 min de trabajo sin commit
- **Respuestas cortas** — ir al punto, no resumir lo que ya se ve en el diff
- **Mesa de desarrollo** — para features nuevas, siempre presentar equipo con nombres propios y esperar aprobación
- **CHANGELOG antes de commit** — siempre actualizar antes de commitear
