---
autor: Sebastian Torres Mejia
cargo: Senior Dev Astro/React
fecha: 2026-04-10
tema: Viabilidad de migracion de arquitectura
estado: revision
---

# Informe de Viabilidad: Migracion de Arquitectura

## 1. Estado actual del codebase

### Estructura Astro

El proyecto usa Astro 6 como generador de sitios estaticos (SSG) con React 19 como framework de islands. La navegacion entre paginas es MPA clasica: cada pagina (index, estudiantes, perfil) es un archivo `.astro` que hace full page reload al navegar.

**Paginas Astro (3):**
- `src/pages/index.astro` -- wrapper del hero + `<Gallery client:load />`
- `src/pages/estudiantes.astro` -- wrapper del header + `<EstudiantesPage client:load />`
- `src/pages/perfil.astro` -- wrapper del header + `<ProfilePage client:load />`

**Layout (1):**
- `src/layouts/Layout.astro` -- HTML shell, topbar con `<UserMenu client:load />`, carga de fonts, model-viewer script

**Componentes React (13):**
- Gallery.tsx, ModelCard.tsx, SortableModelCard.tsx, ModelModal.tsx
- UploadForm.tsx, EditModelForm.tsx, AuthModal.tsx, UserMenu.tsx
- EstudiantesPage.tsx, StudentCard.tsx, HexagonChart.tsx
- ProfilePage.tsx, SkillsEditor.tsx

**Libreria compartida:**
- `src/lib/supabase.ts` -- cliente Supabase, tipos, helpers CRUD

### Acoplamiento a Astro

El acoplamiento es **minimo**. Los componentes React son completamente autonomos:

1. **Ningun componente importa nada de Astro** (`astro:*`, `Astro.props`, etc.)
2. **Sin API routes ni SSR** -- todo es client-side con Supabase directo
3. **Sin middleware Astro** -- no hay `src/middleware.ts`
4. **Sin content collections** -- los datos vienen de Supabase, no de archivos locales
5. **Sin View Transitions de Astro** -- `prefetch: false` explicitamente en config
6. **El CSS es un solo archivo global** (`src/styles/global.css`) importado via `<style is:global>`
7. **model-viewer se carga via CDN** en el Layout, no como dependencia npm

Lo que Astro realmente hace en este proyecto:
- Genera 3 paginas HTML estaticas
- Inyecta el topbar/footer como HTML server-side
- Hidrata los componentes React con `client:load`
- Maneja el build + output estatico para GitHub Pages

### Problema reportado

La navegacion entre paginas (ej: Galeria -> Estudiantes -> Galeria) causa que los contextos WebGL de `<model-viewer>` y los graficos SVG de `<HexagonChart>` no rendericen correctamente. Solo un hard reload (Ctrl+F5) restaura la funcionalidad. Esto es consistente con el modelo MPA de Astro donde cada navegacion destruye y recrea todo el DOM, los contextos WebGL, y el estado de React.

---

## 2. Analisis por opcion de migracion

### Opcion A: Vite + React SPA puro (react-router)

**Que resuelve:**
- Eliminaria el problema de navegacion de raiz. React-router hace transiciones client-side sin destruir el DOM ni los contextos WebGL.
- model-viewer se cargaria una sola vez y persistiria entre "paginas".

**Archivos que se reutilizan tal cual (0 cambios):**
| Archivo | Razon |
|---------|-------|
| `Gallery.tsx` | React puro, sin dependencias Astro |
| `ModelCard.tsx` | React puro |
| `SortableModelCard.tsx` | React puro |
| `ModelModal.tsx` | React puro |
| `UploadForm.tsx` | React puro |
| `EditModelForm.tsx` | React puro |
| `AuthModal.tsx` | Usa `createPortal` estandar |
| `UserMenu.tsx` | React puro |
| `EstudiantesPage.tsx` | React puro |
| `StudentCard.tsx` | React puro |
| `HexagonChart.tsx` | SVG puro en React |
| `ProfilePage.tsx` | React puro |
| `SkillsEditor.tsx` | React puro |
| `src/lib/supabase.ts` | SDK de Supabase, sin Astro |

**Archivos que se eliminan:**
- `src/pages/index.astro`, `estudiantes.astro`, `perfil.astro` (3 archivos)
- `src/layouts/Layout.astro` (1 archivo)
- `astro.config.mjs` (1 archivo)

**Archivos nuevos a crear:**
| Archivo | Contenido |
|---------|-----------|
| `index.html` | HTML shell (lo que hoy hace Layout.astro) |
| `vite.config.ts` | Config Vite con base path `/galeria-3d-clase` |
| `src/main.tsx` | Entry point: ReactDOM.createRoot + RouterProvider |
| `src/App.tsx` | Layout con topbar/nav + `<Outlet>` de react-router |
| `src/routes.tsx` | 3 rutas: `/`, `/estudiantes`, `/perfil` |
| `src/pages/HomePage.tsx` | Hero + Gallery (extraido de index.astro) |

**Dependencias a agregar:** `react-router-dom`
**Dependencias a eliminar:** `astro`, `@astrojs/react`

**Esfuerzo estimado:** 4-6 horas
- 1h: setup Vite + react-router + HTML shell
- 1h: crear App.tsx con layout/nav, mover hero a HomePage
- 1h: configurar base path para GitHub Pages (404.html hack o hash router)
- 1-2h: ajustar deploy workflow + verificar build
- 0.5h: testing manual de navegacion

**Riesgos:**
- **GitHub Pages + SPA routing**: GitHub Pages no soporta fallback a index.html nativamente. Se necesita un hack con `404.html` duplicado o usar HashRouter (`/#/estudiantes`). Esto cambia las URLs visibles.
- **SEO**: Se pierde el HTML pre-renderizado del hero y metadata OG. Para una galeria universitaria esto es impacto bajo.
- **Bundle size**: Todo el JS se carga de golpe (no hay code splitting automatico como en Astro). Se puede mitigar con `React.lazy()` pero es trabajo adicional.

---

### Opcion B: Next.js con output: export (estatico)

**Que resuelve:**
- Mismos beneficios de SPA (navegacion client-side) si se usa el App Router con `<Link>`.
- HTML pre-renderizado para SEO.

**Archivos que se reutilizan tal cual:**
- Los mismos 13 componentes + supabase.ts (identico a Opcion A)

**Archivos nuevos a crear:**
| Archivo | Contenido |
|---------|-----------|
| `next.config.js` | `output: 'export'`, `basePath`, `images.unoptimized` |
| `app/layout.tsx` | Root layout (equivale a Layout.astro) |
| `app/page.tsx` | Home con hero + Gallery |
| `app/estudiantes/page.tsx` | Wrapper de EstudiantesPage |
| `app/perfil/page.tsx` | Wrapper de ProfilePage |

**Dependencias a agregar:** `next`
**Dependencias a eliminar:** `astro`, `@astrojs/react`

**Esfuerzo estimado:** 6-10 horas
- 2h: setup Next.js, migrar config, resolver basePath
- 1h: crear layout + paginas wrapper
- 2-3h: resolver incompatibilidades Next.js:
  - `"use client"` directives en todos los componentes (usan hooks)
  - next/image vs img tags
  - basePath en todos los hrefs internos
  - model-viewer script loading (next/script)
- 1-2h: ajustar GitHub Actions workflow
- 1h: testing

**Riesgos:**
- **Complejidad innecesaria**: Next.js trae SSR, API routes, middleware, image optimization -- nada de esto se necesita. Es un framework pesado para un proyecto que solo necesita 3 paginas estaticas.
- **`"use client"` everywhere**: Todos los componentes usan hooks de React; todos necesitarian la directiva `"use client"`. Esto anula la ventaja principal de Next.js (Server Components).
- **basePath issues**: Next.js con `output: 'export'` y `basePath` tiene edge cases conocidos con assets y rutas. Se necesita verificar a fondo.
- **Lock-in a Vercel ecosystem**: Aunque funciona en Pages, el DX esta optimizado para Vercel.

---

### Opcion C: Mantener Astro, convertir a SPA (una sola pagina con tabs)

**Que resuelve:**
- Elimina la navegacion MPA completamente. No hay page reload, asi que WebGL y SVG nunca se destruyen.
- Mantiene Astro como build tool (sin cambiar deploy ni dependencias).

**Concepto:**
Fusionar las 3 paginas en una sola `index.astro` con un componente React raiz `<App />` que maneja tabs/vistas internamente con estado React.

**Archivos que se reutilizan tal cual:**
- Los mismos 13 componentes + supabase.ts

**Archivos que se modifican:**
| Archivo | Cambio |
|---------|--------|
| `src/pages/index.astro` | Reemplazar hero + Gallery por `<App client:load />` |
| `src/layouts/Layout.astro` | Remover topbar nav (se mueve a React) |

**Archivos que se eliminan:**
- `src/pages/estudiantes.astro`
- `src/pages/perfil.astro`

**Archivos nuevos a crear:**
| Archivo | Contenido |
|---------|-----------|
| `src/components/App.tsx` | Componente raiz: topbar con tabs + vista activa |

**Dependencias:** Sin cambios. No se agrega ni se elimina nada.

**Esfuerzo estimado:** 2-4 horas
- 1h: crear App.tsx con estado de tab y renderizado condicional
- 0.5h: mover topbar a React
- 0.5h: mover hero a un componente o integrarlo en App
- 0.5h: eliminar paginas astro sobrantes
- 0.5h: testing

**Riesgos:**
- **URLs**: Se pierden las URLs `/estudiantes` y `/perfil`. La app vive solo en `/`. Se puede mitigar con `window.history.pushState` manual para mantener URLs cosmeticas, pero no hay deep linking real sin mas trabajo.
- **SEO**: Similar a Opcion A, se pierde metadata especifica por pagina.
- **Scroll position**: Al cambiar de tab, el scroll no se resetea automaticamente. Requiere un `window.scrollTo(0,0)` manual.
- **UserMenu logout redirect**: `window.location.href` en UserMenu fuerza reload; hay que cambiarlo a cambio de tab.

---

## 3. Matriz comparativa

| Criterio | A: Vite SPA | B: Next.js | C: Astro SPA |
|----------|:-----------:|:----------:|:------------:|
| Resuelve el problema WebGL | Si | Si | Si |
| Esfuerzo de migracion | Medio (4-6h) | Alto (6-10h) | Bajo (2-4h) |
| Riesgo de regresiones | Bajo | Medio | Muy bajo |
| Dependencias nuevas | react-router-dom | next | Ninguna |
| Cambios en deploy | Si (404.html) | Si (next export) | No |
| Cambios en CI/CD | Minimos | Significativos | Ninguno |
| URLs limpias | Con hack | Si | No (sin mas trabajo) |
| SEO pre-renderizado | No | Si | No |
| Code splitting | Manual | Automatico | N/A (1 pagina) |
| Complejidad a futuro | Media | Alta | Baja |

---

## 4. Recomendacion

### Opcion C (Astro SPA) como primer paso, con upgrade a Opcion A si escala

**Justificacion:**

1. **Menor riesgo**: Cero dependencias nuevas, cero cambios en deploy, cero cambios en CI/CD. El unico riesgo real es la perdida de URLs, que se mitiga con `pushState`.

2. **Resuelve el problema de raiz**: Si todo vive en un solo arbol React, los contextos WebGL de model-viewer nunca se destruyen al cambiar de vista. El SVG del HexagonChart tampoco se desmonta innecesariamente.

3. **Acoplamiento actual lo permite**: Los 13 componentes React no tienen ninguna dependencia en Astro. Moverlos bajo un `<App />` raiz es puramente organizacional.

4. **Path de escape claro**: Si el proyecto crece (mas paginas, necesidad de deep linking real, SEO), migrar de Astro SPA a Vite + react-router es incremental: ya se tiene el componente `App.tsx`, solo se cambia el build tool.

5. **Next.js es sobredimensionado**: El proyecto no necesita SSR, Server Components, API routes, ni image optimization. Agregar Next.js introduce complejidad que no aporta valor.

### Plan de implementacion sugerido

```
Sprint 1 (1 dia):
  - Crear src/components/App.tsx con tabs (galeria | estudiantes | perfil)
  - Mover topbar nav de Layout.astro a App.tsx
  - Eliminar paginas astro sobrantes
  - Mover hero inline a componente o a App.tsx

Sprint 2 (0.5 dia):
  - Agregar window.history.pushState para URLs cosmeticas
  - Manejar popstate (boton atras del browser)
  - Scroll to top al cambiar de tab
  - Fix: UserMenu logout cambia tab en vez de redirect

Sprint 3 (si se requiere mas adelante):
  - Migrar a Vite + react-router si se necesitan rutas reales
```

---

## 5. Inventario de acoplamiento

Para dejar documentado que tan facil es cada componente de migrar:

| Componente | Acoplado a Astro | Acoplado a modelo de datos | Notas |
|------------|:-----------------:|:--------------------------:|-------|
| Gallery.tsx | No | Si (Supabase directo) | Componente mas complejo, 400 LOC |
| ModelCard.tsx | No | No (props puras) | Portable |
| SortableModelCard.tsx | No | No (wrapper DnD) | Portable |
| ModelModal.tsx | No | Si (comments CRUD) | Portable |
| UploadForm.tsx | No | Si (Storage + insert) | Portable |
| EditModelForm.tsx | No | Si (update) | Portable |
| AuthModal.tsx | No | Si (Auth) | Usa createPortal |
| UserMenu.tsx | No | Si (Auth + Profile) | Tiene `window.location.href` hardcoded |
| EstudiantesPage.tsx | No | Si (profiles + skills) | Portable |
| StudentCard.tsx | No | Si (links update) | Portable |
| HexagonChart.tsx | No | No (SVG puro, props) | 100% portable |
| ProfilePage.tsx | No | Si (profile CRUD) | Tiene `window.location` hardcoded |
| SkillsEditor.tsx | No | Si (upsert skills) | Portable |
| supabase.ts | No | N/A | Lib pura, sin imports de Astro |

**Conclusion**: 0 de 14 archivos tienen acoplamiento a Astro. La migracion es viable en cualquiera de las 3 opciones.

---

*Sebastian Torres Mejia -- Senior Dev Astro/React*
*2026-04-10*
