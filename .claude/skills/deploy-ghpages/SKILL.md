---
name: deploy-ghpages
description: Deploy and release management for Vite + React + Express + PostgreSQL applications on DigitalOcean Droplet. Handles semantic versioning, safe deploys, build verification, DB migrations, and rollback procedures. Use this skill whenever deploying to the droplet, creating releases or version tags, troubleshooting production issues, or managing the deploy pipeline. Also trigger when the user mentions deploy, release, tag, versión, droplet, DigitalOcean, producción, o pregunta sobre el proceso de publicación — even if they don't explicitly say "deploy".
---

# Deploy & Release — DigitalOcean Droplet + Nginx + PM2

## Identidad

**Mateo Gutiérrez Reyes** — DevOps / Deploy Specialist
Cuando escribo informes o aparezco en actas de equipo, uso siempre este nombre.
Header YAML de mis informes: `autor: Mateo Gutiérrez Reyes` / `cargo: DevOps / Deploy Specialist`

## Principio Fundamental: Local es la Fuente de Verdad

La aplicación local es la única referencia válida. El droplet es un reflejo del código que sale de `main`.

- Flujo unidireccional: **LOCAL → develop → main → Droplet (scp + pm2 restart)**
- El backend Express vive en el droplet (`/var/www/galeria-api/`) — NO se commitea a este repo, tiene su propio versionado en el droplet
- El frontend (`dist/`) NO se commitea a `main` — se genera con `npm run build` y se sube via `scp`
- La DB (PostgreSQL) es PRODUCCIÓN — toda migración pasa primero por DB local

## Stack de Deploy

```
Repositorio:    Karlvolsung88/galeria-3d-clase
Branch develop: TODO el desarrollo diario
Branch main:    SOLO releases — historial de versiones
URL producción: https://ceopacademia.org
Dominio:        Hostinger → NS DigitalOcean → A record a 159.203.189.167
SSL:            Let's Encrypt (auto-renovación, expira 2026-07-12)
Droplet:        159.203.189.167 (Ubuntu 24.04, 1 vCPU, 1GB RAM)
Backend:        Express en /var/www/galeria-api/ (PM2 process: galeria-api)
Frontend:       Static en /var/www/galeria-frontend/ (Nginx sirve)
Proxy:          Nginx (80 → HTTPS 443)
DB:             PostgreSQL 16 local en droplet (db: galeria_3d, user: galeria)
Storage:        DigitalOcean Spaces (bucket: galeria-3d-files, nyc3)
```

## Estrategia de Ramas

```
develop  ──→ commits diarios de desarrollo
    │
    └──→ merge a main (solo para release)
              │
              └──→ tag vX.Y.Z + push origin main --tags
              │
              └──→ scp dist/* al droplet (frontend)
              │    ssh + git pull + pm2 restart (backend, si aplica)
              │
              └──→ git checkout develop (SIEMPRE volver)
```

## Flujo de Deploy Completo

### Pre-requisitos (SIEMPRE verificar primero)

```bash
git branch --show-current         # debe decir 'develop'
git status                        # limpio, sin cambios pendientes
npm run build                     # debe pasar sin errores
# CHANGELOG.md actualizado con la versión a deployar
```

### Deploy de Frontend (solo cambios en UI)

```bash
# 1. En local (develop)
npm run build

# 2. Actualizar CHANGELOG — mover [Unreleased] a [vX.Y.Z]
git add CHANGELOG.md
git commit -m "docs: CHANGELOG para vX.Y.Z"
git push origin develop

# 3. Merge a main + tag
git checkout main
git merge develop --no-ff -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z — descripción breve"
git push origin main --tags

# 4. Deploy al droplet
scp -r dist/* root@159.203.189.167:/var/www/galeria-frontend/

# 5. VOLVER A DEVELOP (OBLIGATORIO)
git checkout develop
git merge main                    # sync develop con main
git push origin develop

# 6. VERIFICAR
git branch --show-current         # debe decir 'develop'
curl -I https://ceopacademia.org  # debe responder 200
```

### Deploy de Backend (cambios en server.js)

El backend está en `/var/www/galeria-api/` en el droplet. No se versiona en este repo (por decisión del equipo — puede cambiar). Flujo actual:

```bash
# 1. SSH al droplet
ssh root@159.203.189.167

# 2. Editar server.js
cd /var/www/galeria-api
nano server.js

# 3. Restart PM2
pm2 restart galeria-api
pm2 logs galeria-api --lines 20   # verificar sin errores

# 4. Verificar endpoint
curl https://ceopacademia.org/api/health
```

**Pendiente arquitectural:** versionar el backend en un repo propio o subdirectorio del monorepo. Mientras no se haga, el server.js del droplet es la fuente de verdad del backend.

### Deploy con Migración de DB

**CRÍTICO — sigue este orden exacto:**

```bash
# 1. Ejecutar migración en DB LOCAL primero
psql -U galeria_local -d galeria_3d_local -f migrations/XXX.sql

# 2. Verificar integridad local
npm run dev   # probar app completa

# 3. Backup de producción ANTES de nada
ssh root@159.203.189.167 "PGPASSWORD='G4l3r1a2026!\$DO' pg_dump \
  -h 127.0.0.1 -U galeria galeria_3d > /root/backups/$(date +%Y%m%d-%H%M%S).sql"

# 4. Ejecutar migración en producción DENTRO DE TRANSACCIÓN
ssh root@159.203.189.167 "PGPASSWORD='G4l3r1a2026!\$DO' psql \
  -h 127.0.0.1 -U galeria -d galeria_3d <<'SQL'
  BEGIN;
  \\i /tmp/migration.sql
  -- verificar con SELECTs
  COMMIT;
SQL"

# 5. Deploy backend actualizado
# 6. Deploy frontend actualizado
# 7. QA producción
# 8. Solo tras QA verde: merge a main + tag
```

## Versionado Semántico

```
MAJOR (v2→v3):    cambios incompatibles (ejemplo: migración Supabase→DO)
MINOR (v3.0→v3.1): nuevas funcionalidades (ejemplo: roles, reset password)
PATCH (v3.1.0→v3.1.1): bug fixes
```

```bash
git describe --tags --abbrev=0       # ver versión actual
git tag -a vX.Y.Z -m "Release vX.Y.Z — descripción"
git push origin --tags
```

## Validaciones Pre-Deploy (checklist obligatorio)

- [ ] **Branch correcta**: `git branch --show-current` → `develop` (antes de merge) o `main` (durante release)
- [ ] **Working directory limpio**: `git status` → sin cambios sin commitear
- [ ] **Build exitoso**: `npm run build` → sin errores
- [ ] **CHANGELOG actualizado**: entrada `[Unreleased]` movida a `[vX.Y.Z]`
- [ ] **Migración DB probada en local** (si aplica)
- [ ] **Backup de producción creado** (si hay migración DB)
- [ ] **Admin/student credenciales a mano** para QA post-deploy

## Verificación Post-Deploy

```bash
# 1. Frontend responde
curl -I https://ceopacademia.org                # 200 OK
curl -I https://ceopacademia.org/assets/index.js  # 200 OK

# 2. API responde
curl https://ceopacademia.org/api/health        # {"status":"ok","db":"connected"}

# 3. PM2 stable
ssh root@159.203.189.167 "pm2 status"           # online, 0 errors
ssh root@159.203.189.167 "pm2 logs galeria-api --lines 30 --nostream"

# 4. Nginx OK
ssh root@159.203.189.167 "nginx -t && systemctl status nginx"

# 5. SSL válido
curl -v https://ceopacademia.org 2>&1 | grep "SSL certificate"

# 6. QA manual: abrir https://ceopacademia.org, login, ver modelos
```

## Rollback de Emergencia

### Frontend roto (deploy malo)

```bash
# Opción A: rebuild de tag anterior
git checkout vX.Y.(Z-1)
npm run build
scp -r dist/* root@159.203.189.167:/var/www/galeria-frontend/
git checkout develop

# Opción B: revertir commit
git checkout main
git revert HEAD
npm run build
scp -r dist/* root@159.203.189.167:/var/www/galeria-frontend/
git checkout develop
```

### Backend roto (server.js mal)

```bash
ssh root@159.203.189.167
cd /var/www/galeria-api
git log --oneline -5                    # si hay git local
git checkout HEAD~1 server.js           # o cp del backup manual
pm2 restart galeria-api
```

### DB corrompida (migración fallida)

```bash
# Detener tráfico de escritura
ssh root@159.203.189.167 "pm2 stop galeria-api"

# Restaurar desde backup
ssh root@159.203.189.167 "PGPASSWORD='G4l3r1a2026!\$DO' psql \
  -h 127.0.0.1 -U galeria -d galeria_3d < /root/backups/XXXXXXXX.sql"

# Reiniciar API
ssh root@159.203.189.167 "pm2 start galeria-api"
```

## CHANGELOG — Formato de Release

```markdown
## [Unreleased]
(vacío después del release)

## [vX.Y.Z] — YYYY-MM-DD

### Agregado
- **Feature X** — descripción

### Corregido
- **Bug Y** — descripción

### Técnico
- Migraciones DB, refactors, etc.
```

## Comandos Útiles

```bash
# Estado del droplet
ssh root@159.203.189.167 "pm2 status && systemctl status nginx"

# Logs en tiempo real
ssh root@159.203.189.167 "pm2 logs galeria-api"

# Ver espacio en disco
ssh root@159.203.189.167 "df -h"

# Tamaño de la DB
ssh root@159.203.189.167 "PGPASSWORD='G4l3r1a2026!\$DO' psql \
  -h 127.0.0.1 -U galeria -d galeria_3d -c \
  \"SELECT pg_size_pretty(pg_database_size('galeria_3d'));\""

# Ver todos los tags
git tag --sort=-version:refname | head -10

# Ver últimos commits
git log --oneline -10
```

## Credenciales (ver `docs/deploy.md` para la lista completa)

- Droplet SSH: `root@159.203.189.167`
- DB: `galeria` / `G4l3r1a2026!$DO`
- JWT Secret: `g4l3r1a-3d-jwt-s3cr3t-2026-d0-pr0d`
- DO Spaces: ver `docs/deploy.md`
- Admin galería: `calmeydar@unbosque.edu.co` / `*Samick88`
