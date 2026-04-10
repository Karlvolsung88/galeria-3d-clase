# Contexto del Proyecto — Galería 3D

> **Para Claude en cualquier dispositivo:** Lee este archivo al inicio de cada sesión.
> Es la fuente de verdad portable del proyecto. Complementa `CLAUDE.md`.
> Última actualización: 2026-04-10

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
| **Framework** | Astro 6 + React 19 |
| **Backend** | Supabase (PostgreSQL 15 + Auth + Storage) |
| **3D** | `<model-viewer>` (Google Web Component) |
| **Styling** | CSS custom (dark + neubrutalism) |
| **Deploy** | GitHub Pages via GitHub Actions |
| **Repo** | `Karlvolsung88/galeria-3d-clase` |
| **URL prod** | https://karlvolsung88.github.io/galeria-3d-clase/ |
| **Semestre** | 2026-1 |

### Ramas
- `develop` — TODO el desarrollo diario
- `main` — solo recibe merges para producción. Nunca desarrollar directo en main.

### Tablas Supabase
```
profiles   (id UUID, full_name, role: admin|student, artstation_url, instagram_url, bio)
models     (id, title, student, category, tags[], file_name, file_url, user_id → profiles)
student_skills (user_id → profiles, skill_name, value 0–100)
likes      (user_id → auth.users, model_id → models)
comments   (user_id → auth.users, model_id → models, text)
```

> **Nota crítica:** `comments.user_id` y `likes.user_id` apuntan a `auth.users`, NO a `public.profiles`.
> Por eso los joins PostgREST `.select('*, profiles(...)')` dan 400. Usar siempre dos queries separadas.

### Categorías de modelos
`personaje | vehículo | criatura | objeto`

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
| **Sebastián Torres Mejía** | Senior Dev Astro/React | `senior-dev-astro` | `/dev` |
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

### Por qué NO hay ClientRouter (ViewTransitions)
Astro 6 renombró `ViewTransitions` a `ClientRouter`. Pero `ClientRouter` es incompatible con múltiples islands `client:load` — los componentes React no se rehidratan en el swap de página, dejando pantallas en blanco. Se removió. La galería usa navegación estándar con full-page reload.

### Patrón obligatorio para queries con Supabase v2
Supabase v2 encola TODAS las queries durante el refresh de token al init. Si se lanzan queries antes de `await getSession()`, las promesas nunca se resuelven. Patrón correcto en todos los componentes:

```typescript
const init = async () => {
  const { data: { session } } = await supabase.auth.getSession(); // PRIMERO
  // luego queries que dependan de auth
  // luego queries públicas
};
```

### Por qué AuthModal usa createPortal
`#top-bar` tiene `backdrop-filter: blur(12px)` que crea un containing block para `position: fixed`. Sin `createPortal`, el modal queda posicionado relativo al top-bar (44px desde arriba). Fix: `createPortal(content, document.body)`.

### Joins PostgREST rotos en comments/likes
Las FKs de `comments.user_id` y `likes.user_id` apuntan a `auth.users`, no a `public.profiles`. PostgREST no puede resolver el join. Siempre usar dos queries separadas:
```typescript
// 1. fetch comments con select('*')
// 2. fetch profiles con .in('id', userIds)
// 3. merge manual
```

---

## Estado del Proyecto (2026-04-10)

### Lo que está funcionando en producción
- Galería principal con modelos 3D (`model-viewer`)
- Filtros por categoría
- Sistema de likes con conteo
- **Contador de comentarios** (icono burbuja al estilo Instagram) — recién desplegado
- Sistema de comentarios completo (modal)
- Auth con Supabase (admin / student / visitante)
- Página `/estudiantes` con radar chart SVG de habilidades
- Página `/perfil`
- Upload de modelos GLB (solo admin/student)
- RLS policies en todas las tablas

### Cuándo convocar a Felipe Vargas Montoya (/browser)
- Cualquier comportamiento diferente entre Chrome y Edge/Safari/Firefox
- Modelos 3D en blanco o que no cargan en algún navegador
- **Primer diagnóstico siempre: mirar el Network tab** — si no hay requests a Supabase, el problema es JS/auth, no WebGL
- Caso resuelto (2026-04-10): Edge bloqueaba `getSession()` silenciosamente → `getSessionSafe()` con timeout de 5s

### Bugs conocidos resueltos (no reabrir)
- Race condition auth → patrón `await getSession()` en `init()`
- Modal login descentrado → `createPortal`
- Loading infinito → `try/catch/finally` en todos los componentes
- Comments 400 → dos queries separadas
- Vite cache corruption → `rm -rf node_modules/.vite && npm run dev -- --force`

### Herramientas
- `gh` CLI **NO está instalado** en Windows. Usar `git` directamente.
- Build: `npm run build` — siempre antes de commit si se tocó UI
- Dev: `npm run dev`

---

## Preferencias de Trabajo del Usuario

- **Análisis antes de código** — nunca implementar sin leer el código primero y pedir aprobación
- **Sin parches improvisados** — si algo falla 2 veces, parar y hacer auditoría
- **Commits frecuentes** — máximo 30 min de trabajo sin commit
- **Respuestas cortas** — ir al punto, no resumir lo que ya se ve en el diff
- **Mesa de desarrollo** — para features nuevas, siempre presentar equipo con nombres propios y esperar aprobación
- **CHANGELOG antes de commit** — siempre actualizar antes de commitear
