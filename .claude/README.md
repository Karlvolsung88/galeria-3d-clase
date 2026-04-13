# Configuración de Claude Code — Galería 3D Interactiva

## Estructura

```
.claude/
├── skills/                          # Perfiles especializados de Claude
│   ├── senior-dev-astro/           # 🔧 Desarrollo diario (DEFAULT)
│   ├── planner-analyst/            # 💭 Planificación y análisis
│   ├── software-architect-web/     # 🏗️ Arquitectura y diseño
│   ├── frontend-3d/                # 🎨 Diseño Frontend + 3D
│   ├── testing-web/                # 🧪 Testing y QA manual
│   ├── security-supabase/          # 🔒 Seguridad y datos
│   ├── deploy-ghpages/             # 🚀 Deploy DigitalOcean
│   ├── qa/                         # ✅ Quality Assurance
│   └── skill-creator/              # ⚙️ Crear/mejorar skills
├── commands/                        # Slash commands personalizados
├── settings.local.json
└── README.md
```

---

## Equipo de Especialistas

### Mi identidad (Claude)

**Claude Renard** — Líder de Desarrollo / Tech Lead

### Los especialistas

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

## Contexto del Proyecto

### Tecnologías
- **Frontend**: Vite 6 + React 19 + React Router 7
- **3D**: Three.js + React Three Fiber + Drei
- **Backend**: Node.js + Express (DigitalOcean Droplet)
- **Database**: PostgreSQL 16 (local en droplet)
- **Storage**: DigitalOcean Spaces (S3 CDN)
- **Auth**: JWT custom (bcryptjs + jsonwebtoken)
- **Styling**: CSS custom (dark + neubrutalism)
- **Deploy**: Nginx en Droplet (159.203.189.167)

### Repositorio
- **GitHub**: Karlvolsung88/galeria-3d-clase
- **URL Producción**: http://159.203.189.167
- **Ramas**: `develop` (desarrollo), `main` (producción)

### Tablas PostgreSQL
- `profiles` — perfiles con roles (admin/student), password hash
- `models` — modelos 3D de estudiantes
- `likes` — likes de modelos
- `comments` — comentarios en modelos
- `student_skills` — habilidades de estudiantes

### Categorías de Modelos
`personaje | vehiculo | criatura | objeto`

### Roles
- **admin** — Profesor: puede gestionar todos los modelos
- **student** — Estudiante: solo sus propios modelos
- **visitante** — Sin auth: solo lectura

---

## Slash Commands

| Comando | Skill | Descripción |
|---------|-------|-------------|
| `/dev` | senior-dev-astro | Desarrollo diario, CRUDs, fixes |
| `/plan` | planner-analyst | Planificación de features |
| `/architect` | software-architect-web | Arquitectura y decisiones |
| `/frontend` | frontend-3d | UI/UX, componentes, estilos |
| `/test` | testing-web | Testing y verificación |
| `/security` | security-supabase | Seguridad, datos, auth |
| `/deploy` | deploy-ghpages | Deploy a DigitalOcean |
| `/qa` | qa | Quality Assurance |
| `/browser` | browser-js-expert | Bugs cross-browser, WebGL |

---

**Última actualización**: 2026-04-13
**Proyecto**: Galería 3D Interactiva — Estudio de Creación Digital 4
