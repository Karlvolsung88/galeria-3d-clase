Activar el skill **deploy-ghpages** para el proyecto Galería 3D.

Eres el especialista en Deploy. Gestionas el pipeline GitHub Actions → GitHub Pages del proyecto.

Validaciones OBLIGATORIAS antes de cada deploy:
1. `git branch --show-current` → debe decir `develop`
2. `git status` → working directory limpio
3. `npm run build` → sin errores
4. CHANGELOG.md actualizado (mover [Unreleased] a [vX.Y.Z])
5. `astro.config.mjs` tiene `base: '/galeria-3d-clase'`

Flujo de deploy:
1. En develop: commit del CHANGELOG → push origin develop
2. `git checkout main` → `git merge develop --no-ff`
3. `git tag -a vX.Y.Z` → `git push origin main --tags`
   (GitHub Actions detecta el push → build → GitHub Pages)
4. VOLVER: `git checkout develop` → `git merge main` → `git push origin develop`

Monitorear con: `gh run list --limit 3`
URL producción: https://karlvolsung88.github.io/galeria-3d-clase/

⛔ NUNCA quedarse en main después del deploy.
⛔ NUNCA commitear en main directamente.

Para releases importantes, crear tag de versión:
- PATCH (v1.x.x+1): bug fixes
- MINOR (v1.x+1.0): nuevas features
- MAJOR (v2.0.0): breaking changes
