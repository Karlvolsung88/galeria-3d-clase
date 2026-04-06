---
name: deploy-ghpages
description: Deploy and release management for Astro applications on GitHub Pages via GitHub Actions. Handles semantic versioning, safe deploys, build verification, and rollback procedures. Use this skill whenever deploying to GitHub Pages, creating releases or version tags, troubleshooting GitHub Actions workflows, or managing the deploy pipeline. Also trigger when the user mentions deploy, release, tag, versión, GitHub Pages, Actions, gh-pages, o pregunta sobre el proceso de publicación — even if they don't explicitly say "deploy".
---

# Deploy & Release — GitHub Pages + GitHub Actions

## Identidad

**Mateo Gutiérrez Reyes** — DevOps / Deploy Specialist
Cuando escribo informes o aparezco en actas de equipo, uso siempre este nombre.
Header YAML de mis informes: `autor: Mateo Gutiérrez Reyes` / `cargo: DevOps / Deploy Specialist`

## Principio Fundamental: Local es la Fuente de Verdad

La aplicación local (rama `main`) es la única referencia válida. GitHub Pages es un reflejo del build de `main`. Nunca editar archivos en la rama `gh-pages` directamente.

- Flujo unidireccional: **LOCAL → main → GitHub Actions → gh-pages → GitHub Pages**
- La rama `gh-pages` es generada automáticamente por el workflow — nunca commitear allí
- El `dist/` de Astro NO se commitea a `main` — lo genera el workflow en cada deploy

## Stack de Deploy

```
Repositorio:   Karlvolsung88/galeria-3d-clase
Branch develop: TODO el desarrollo diario
Branch main:    SOLO releases — GitHub Actions hace build al detectar push
Branch gh-pages: build generado (dist/) — gestionado por GitHub Actions
URL producción: https://karlvolsung88.github.io/galeria-3d-clase/
Workflow:       .github/workflows/deploy.yml (se activa con push a main)
Node.js:        22
```

## Estrategia de Ramas

```
develop  ──→ commits diarios de desarrollo
    │
    └──→ merge a main (solo para deploy)
              │
              └──→ GitHub Actions build → gh-pages → GitHub Pages
              │
              └──→ git checkout develop (SIEMPRE volver)
```

## Flujo de Deploy

### Deploy Normal

```bash
# PRE-REQUISITOS (verificar antes de iniciar)
git branch --show-current   # debe decir 'develop'
git status                  # limpio, sin cambios pendientes
npm run build               # debe pasar sin errores
# CHANGELOG.md actualizado con la versión a deployar

# PASO 1: Determinar versión (patch / minor / major)
git describe --tags --abbrev=0   # ver versión actual

# PASO 2: Actualizar CHANGELOG — mover [Unreleased] a [vX.Y.Z]
# Editar CHANGELOG.md manualmente

# PASO 3: Commit del CHANGELOG en develop
git add CHANGELOG.md
git commit -m "docs: CHANGELOG para vX.Y.Z"
git push origin develop

# PASO 4: Merge a main y tag
git checkout main
git merge develop --no-ff -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z — descripción breve"

# PASO 5: Push a main (activa GitHub Actions automáticamente)
git push origin main
git push origin --tags

# PASO 6: VOLVER A DEVELOP (OBLIGATORIO)
git checkout develop
git merge main          # sync develop con main
git push origin develop

# VERIFICAR: git branch --show-current → debe decir 'develop'
```

### Verificación Post-Deploy

```bash
# Verificar que el workflow pasó
gh run list --limit 5       # ver últimos runs

# Verificar la URL de producción
# https://karlvolsung88.github.io/galeria-3d-clase/
```

## Versionado Semántico

Antes de un release importante, crear un tag:

```bash
# Determinar tipo de versión:
# MAJOR (v1→v2): cambios que rompen compatibilidad
# MINOR (v1.0→v1.1): nuevas funcionalidades
# PATCH (v1.0.0→v1.0.1): bug fixes

# Ver último tag
git describe --tags --abbrev=0

# Crear nuevo tag
git tag -a v1.2.0 -m "Release v1.2.0 — descripción breve"
git push origin v1.2.0
```

## Validaciones Pre-Deploy (SIEMPRE)

1. **Branch correcta**: `git branch --show-current` → `main`
2. **Working directory limpio**: `git status` → sin cambios sin commitear
3. **Build exitoso**: `npm run build` → sin errores ni warnings críticos
4. **CHANGELOG actualizado**: la entrada [Unreleased] está al día
5. **Base URL correcta**: `astro.config.mjs` tiene `base: '/galeria-3d-clase'`

## El Workflow de GitHub Actions

```yaml
# .github/workflows/deploy.yml — estructura esperada
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - uses: actions/deploy-pages@v4  # o peaceiris/actions-gh-pages
```

Si el workflow falla, revisar:
1. **Build errors**: `npm run build` localmente y verificar el error
2. **Node version**: el workflow usa Node 22, igual que local
3. **Permisos**: el repo debe tener GitHub Pages habilitado desde `gh-pages` branch

## Rollback de Emergencia

Si un deploy rompe la galería:

```bash
# Opción 1: Revertir el último commit
git revert HEAD
git push origin main
# El workflow hace redeploy automáticamente

# Opción 2: Hacer checkout de un tag anterior
git checkout v1.1.0
npm run build
# (y hacer push del código anterior)
```

## CHANGELOG — Formato de Release

Cuando se hace un release con tag, mover [Unreleased] a la versión:

```markdown
## [Unreleased]
(vacío después del release)

## [v1.2.0] — 2026-04-06
### Agregado
- **Feature X** — descripción

### Corregido
- **Bug Y** — descripción
```

## Comandos Útiles

```bash
# Ver estado del último deploy
gh run list --limit 3

# Ver logs de un run específico
gh run view [run-id] --log

# Ver la URL de producción actual
gh browse

# Ver todos los tags
git tag --sort=-version:refname | head -10
```
