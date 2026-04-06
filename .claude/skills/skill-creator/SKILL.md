---
name: skill-creator
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, or benchmark skill performance. Also trigger when the user says "quiero crear un skill", "modifica el skill de X", "el skill Y no está funcionando bien", or wants to add a new specialist to the team.
---

# Skill Creator — Galería 3D

## Propósito

Crear nuevos skills, modificar los existentes y medir su rendimiento. El proceso va así:

1. Decidir qué quieres que haga el skill y cómo debería hacerlo
2. Escribir un borrador del skill
3. Crear prompts de prueba y ejecutar Claude con el skill
4. Evaluar los resultados cualitativamente
5. Reescribir el skill basado en feedback
6. Repetir hasta estar satisfecho

## Proceso de Creación

### Paso 1: Definir el skill

Antes de escribir nada, responder:
- ¿Cuál es el nombre del skill? (snake-case)
- ¿Cuál es el propósito en una oración?
- ¿Cuándo debe activarse? (el campo `description` del frontmatter)
- ¿Qué información específica del proyecto necesita?
- ¿Con qué otros skills interactúa?

### Paso 2: Escribir el SKILL.md

```markdown
---
name: nombre-skill
description: [Una oración que describe CUÁNDO activar este skill.
             Incluir ejemplos de frases del usuario que lo disparan.
             Este campo es crítico — Claude lo usa para decidir si activar el skill.]
---

# Título del Skill

## Propósito
[Qué hace y para qué sirve]

## Principios
[2-5 principios que guían el comportamiento]

## [Secciones específicas del dominio]

## Contexto del Proyecto
[Información específica de la Galería 3D que necesita este skill]
```

### Paso 3: Registrar en `.claude/README.md`

Agregar el skill a la tabla de skills y al índice de comandos si tiene slash command asociado.

### Paso 4: Crear el comando slash (si aplica)

En `.claude/commands/nombre.md`:
```markdown
Activar el skill [nombre-skill] para el proyecto Galería 3D.

[Instrucciones específicas del modo de operación]
```

## Skills Existentes en el Proyecto

| Skill | Propósito | Comando |
|-------|-----------|---------|
| `senior-dev-astro` | Desarrollo diario | `/dev` |
| `planner-analyst` | Planificación | `/plan` |
| `software-architect-web` | Arquitectura | `/architect` |
| `frontend-3d` | UI/UX galería | `/frontend` |
| `testing-web` | Testing y QA | `/test` |
| `security-supabase` | Seguridad y RLS | `/security` |
| `deploy-ghpages` | Deploy y releases | `/deploy` |
| `qa` | Quality Assurance | `/qa` |
| `skill-creator` | Crear/mejorar skills | — |

## Directrices para el Campo `description`

El campo `description` en el frontmatter es lo más importante del skill — es lo que Claude usa para decidir si activarlo.

**Bueno:**
```
description: Senior developer for Astro + React + Supabase. Use this skill
for daily development tasks. Also trigger when the user asks to implement
something, fix a bug, or write code — even if they don't say "development".
```

**Malo:**
```
description: Developer skill.
```

Reglas:
- Incluir ejemplos concretos de frases del usuario que disparan el skill
- Mencionar el dominio específico (Astro, Supabase, model-viewer)
- Incluir "Also trigger when..." para capturar casos implícitos
- Máximo ~3 oraciones

## Mejora de Skills Existentes

Para mejorar un skill existente:
1. Leer el SKILL.md actual con Read tool
2. Identificar qué está faltando o qué genera respuestas incorrectas
3. Proponer cambios específicos con justificación
4. Editar el SKILL.md

Casos comunes de mejora:
- El skill no se activa cuando debería → mejorar el campo `description`
- El skill genera código con el stack incorrecto → agregar más contexto del proyecto
- El skill ignora una restricción importante → agregar a los principios o anti-patrones

## Ubicación de Skills

```
F:\Estudio de Creacion Digital IV\Galeria\.claude\skills\
├── senior-dev-astro/SKILL.md
├── planner-analyst/SKILL.md
├── software-architect-web/SKILL.md
├── frontend-3d/SKILL.md
├── testing-web/SKILL.md
├── security-supabase/SKILL.md
├── deploy-ghpages/SKILL.md
├── qa/SKILL.md
└── skill-creator/SKILL.md  ← este archivo
```
