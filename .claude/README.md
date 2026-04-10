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
│   ├── security-supabase/          # 🔒 Seguridad y RLS
│   ├── deploy-ghpages/             # 🚀 Deploy GitHub Pages
│   ├── qa/                         # ✅ Quality Assurance
│   └── skill-creator/              # ⚙️ Crear/mejorar skills
├── commands/                        # Slash commands personalizados
│   ├── dev.md                      # /dev
│   ├── plan.md                     # /plan
│   ├── architect.md                # /architect
│   ├── frontend.md                 # /frontend
│   ├── test.md                     # /test
│   ├── security.md                 # /security
│   ├── deploy.md                   # /deploy
│   └── qa.md                       # /qa
├── settings.local.json             # Permisos de comandos
└── README.md                       # Este archivo
```

---

## Equipo de Especialistas

### Mi identidad (Claude)

**Claude Renard** — Líder de Desarrollo / Tech Lead
Coordino el equipo, presento los especialistas al usuario, dirijo los pitches y soy responsable del trabajo.

### Los especialistas

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

### Metodología: Scrumban

```
BACKLOG → EN PROGRESO (WIP:1) → EN REVISIÓN → DONE
```

- **Sprint**: 1-3 días por feature o grupo de fixes
- **WIP:1**: una sola tarea en progreso a la vez
- **Revisión**: QA + comité antes de marcar DONE
- **Retrospectiva**: session log al cerrar cada sesión

### Cómo se conforma un equipo

Cuando el usuario pide una feature nueva:

1. Claude Renard identifica qué especialistas son relevantes
2. Presenta el equipo con NOMBRES PROPIOS y justificación:
   > "Propongo convocar a: Sebastián Torres (implementación), Natalia Vargas (arquitectura), Diego Ramírez (seguridad)"
3. Usuario aprueba el equipo
4. Cada especialista escribe su informe en `docs/informes/` con header YAML:
   ```
   autor: Nombre del especialista
   cargo: Cargo
   fecha: YYYY-MM-DD
   tema: Tema del informe
   estado: revision
   ```
5. Claude Renard presenta los resultados consolidados

---

## Skills Disponibles

### 1. senior-dev-astro — Desarrollador Senior (DEFAULT)
**Skill de uso diario. Activar para cualquier tarea de código.**

Usar cuando:
- Implementas componentes React nuevos
- Haces queries a Supabase
- Corriges bugs en cualquier parte del proyecto
- Refactorizas código existente
- Cualquier tarea de desarrollo

```
/dev
"Agrega filtro de búsqueda por nombre de estudiante"
"Corrige el bug en el modal de modelo"
"Implementa el conteo de vistas en ModelCard"
```

---

### 2. planner-analyst — Analista Planificador
**Para pensar antes de actuar. Diseña soluciones antes de implementar.**

Usar cuando:
- Tienes una idea pero no está clara
- Necesitas evaluar opciones
- Quieres entender el impacto de un cambio
- Necesitas desglosar una feature en tareas

```
/plan
"Quiero agregar un sistema de etiquetas para buscar modelos"
"Cómo implementaríamos notificaciones cuando alguien comenta?"
"Evalúa opciones para agregar categorías personalizadas"
```

---

### 3. software-architect-web — Arquitecto de Software
**Para decisiones estructurales que afectan a múltiples componentes.**

Usar cuando:
- Planificas features complejas (afectan 3+ archivos)
- Diseñas cambios de schema en Supabase
- Propones refactorizaciones mayores
- Evalúas performance del sitio

```
/architect
"Diseña la arquitectura para un sistema de portfolios por estudiante"
"Revisa el schema actual de Supabase y propón mejoras"
"Cómo optimizaríamos la carga de 50+ modelos GLB?"
```

---

### 4. frontend-3d — Especialista Frontend 3D
**Para todo lo visual: componentes, estilos, model-viewer, UX.**

Usar cuando:
- Diseñas nuevas vistas o componentes
- Mejoras la UX de la galería
- Trabajas con CSS y la estética del proyecto
- Configuras model-viewer para mejor presentación
- Optimizas la experiencia móvil

```
/frontend
"Mejora el diseño de las tarjetas de modelo"
"Agrega animación de entrada a la galería"
"Diseña el estado vacío cuando no hay modelos en una categoría"
"Optimiza el modal para móvil"
```

---

### 5. testing-web — Especialista en Testing
**Para verificar que todo funciona correctamente.**

Usar cuando:
- Necesitas verificar una feature antes de commitear
- Quieres un checklist de pruebas para un flujo
- Necesitas verificar RLS en Supabase
- Quieres crear tests de utilidades con Vitest

```
/test
"Verifica el flujo completo de upload de modelos"
"Crea un checklist de pruebas para el sistema de likes"
"Verifica que las RLS policies están correctas"
```

---

### 6. security-supabase — Data Lead & Arquitecto de Datos
**Para todo lo relacionado con la base de datos: esquema, RLS, queries, migraciones y análisis.**

Usar cuando:
- Diseñas o modificas tablas en Supabase
- Configuras o auditas políticas RLS
- Tienes errores de Supabase (400, FK, constraints)
- Optimizas queries lentas o con N+1
- Analizas datos de la galería (métricas, KPIs, estadísticas)
- Planificas migraciones de datos

```
/security
"Diseña la tabla para guardar vistas de modelos"
"Optimiza la query que trae estudiantes con skills"
"Audita las políticas RLS de la tabla models"
"Qué estudiante tiene más likes este mes?"
"Agrega soft delete a la tabla models"
```

---

### 7. deploy-ghpages — Deploy & Release
**Para gestionar deploys, versiones y el pipeline de GitHub Actions.**

Usar cuando:
- Estás listo para hacer deploy
- Necesitas crear un release con tag
- El workflow de GitHub Actions falla
- Quieres verificar el estado del deploy en producción

```
/deploy
"Estamos listos para hacer deploy de la v1.3.0"
"El workflow de GitHub Actions está fallando"
"Necesito hacer rollback del último deploy"
```

---

### 9. browser-js-expert — Especialista Browser & JavaScript
**Para bugs cross-browser, WebGL, model-viewer, y compatibilidad JS.**

Usar cuando:
- `model-viewer` no muestra el 3D en Edge, Safari o Firefox
- Hay diferencias de rendering entre navegadores
- WebGL no funciona o usa software rendering
- Hay errores de JS específicos de un browser
- Problemas en iOS (todos los browsers usan WebKit)

```
/browser
"El modelo 3D no carga en Edge"
"Safari no muestra el model-viewer"
"En Firefox funciona pero en Chrome no"
"WebGL error en la consola"
"El modelo se ve diferente en iOS"
```

---

### 8. qa — Quality Assurance
**Para revisión estructurada antes de hacer commit/deploy.**

Usar cuando:
- Terminas una feature y quieres asegurar que todo funciona
- Antes de un deploy importante
- Quieres una revisión completa multi-skill

```
/qa
"Hagamos QA del sistema de comentarios"
"Revisemos que el upload de modelos funciona correctamente"
"QA completo antes del deploy"
```

---

## Slash Commands

| Comando | Skill | Descripción |
|---------|-------|-------------|
| `/dev` | senior-dev-astro | Desarrollo diario, CRUDs, fixes |
| `/plan` | planner-analyst | Planificación de features |
| `/architect` | software-architect-web | Arquitectura y decisiones estructurales |
| `/frontend` | frontend-3d | UI/UX, componentes, estilos CSS |
| `/test` | testing-web | Testing y verificación de flujos |
| `/security` | security-supabase | Seguridad, RLS, auth |
| `/deploy` | deploy-ghpages | Deploy a GitHub Pages |
| `/qa` | qa | Quality Assurance completo |
| `/browser` | browser-js-expert | Bugs cross-browser, WebGL, model-viewer |

---

## Contexto del Proyecto

### Tecnologías
- **Framework**: Astro 6 + React 19
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **3D**: model-viewer (Google Web Component)
- **Styling**: CSS custom (dark + neubrutalism)
- **Deploy**: GitHub Pages via GitHub Actions
- **Node.js**: 22

### Repositorio
- **GitHub**: Karlvolsung88/galeria-3d-clase
- **URL Producción**: https://karlvolsung88.github.io/galeria-3d-clase/
- **Branch**: `main` (único branch, single-branch workflow)

### Tablas Supabase
- `models` — modelos 3D de estudiantes
- `profiles` — perfiles con roles (admin/student)
- `likes` — likes de modelos
- `comments` — comentarios en modelos

### Categorías de Modelos
`personaje | vehículo | criatura | objeto`

### Roles
- **admin** — Profesor: puede gestionar todos los modelos
- **student** — Estudiante: solo sus propios modelos
- **visitante** — Sin auth: solo lectura

---

## Guía de Uso por Escenario

### Implementando nueva feature
```
1. /plan    — diseñar la solución
2. /architect — si afecta schema o múltiples componentes
3. /dev     — implementar
4. /security — verificar RLS y auth
5. /qa      — verificar que todo funciona
6. /deploy  — hacer deploy
```

### Corrigiendo un bug
```
1. /dev     — identificar y corregir
2. /test    — verificar el fix
3. /deploy  — si es urgente en producción
```

### Mejorando la UI
```
1. /frontend — diseñar y implementar cambios visuales
2. /qa       — verificar responsive y UX
```

### Auditando seguridad
```
1. /security — revisar RLS y auth
2. /dev      — implementar correcciones
3. /test     — verificar que las políticas funcionan
```

---

**Última actualización**: 2026-04-06
**Versión**: 1.0
**Proyecto**: Galería 3D Interactiva — Estudio de Creación Digital 4
