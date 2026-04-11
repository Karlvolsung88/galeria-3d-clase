---
autor: Natalia Vargas Ospina
cargo: Arquitecta Web
fecha: 2026-04-10
tema: Evaluacion de alternativas de arquitectura — problema de navegacion WebGL/SVG
estado: revision
---

# Evaluacion de Alternativas de Arquitectura

## Problema central

Al navegar entre paginas con links normales (`<a href>`), los componentes WebGL
(`<model-viewer>`) y SVG (`<HexagonChart>`) no renderizan. Solo funcionan tras
hard reload (Ctrl+Shift+R). Se descartaron prefetch, extensiones del navegador,
ClientRouter y ViewTransitions como causas.

## Diagnostico previo al analisis de alternativas

Antes de evaluar migraciones, es necesario entender por que ocurre el problema
en el stack actual, porque esto determina si migrar lo resolveria o si la causa
raiz viajaria con nosotros.

### Estado actual verificado en el codigo

- `astro.config.mjs`: `prefetch: false`, sin ClientRouter, sin ViewTransitions.
- Layout.astro: `<script type="module" async src="...model-viewer.min.js">` en `<head>`.
- Cada pagina (index, estudiantes, perfil) es un `.astro` con un componente React `client:load`.
- Build output: paginas HTML estaticas independientes (`dist/index.html`, `dist/estudiantes/index.html`, etc.).
- No hay SPA routing. Cada click en un `<a href>` es una navegacion completa del navegador.

### La paradoja: si no hay SPA routing, por que falla la navegacion?

En Astro 6 SSG sin ClientRouter, cada navegacion es un **full page load** del
navegador. El HTML se descarga completo, se parsea el DOM, se ejecutan los
scripts. Esto es identico a un hard reload excepto por un factor critico:
**el cache del navegador**.

En una navegacion normal (`<a href>`), el navegador usa el cache HTTP para
recursos ya descargados. En un hard reload (Ctrl+Shift+R), el navegador
**ignora todo el cache** y descarga todo desde cero.

Si los componentes funcionan con hard reload pero no con navegacion normal,
las causas mas probables son:

1. **Cache de scripts con version stale**: El script de model-viewer cargado
   desde CDN puede estar sirviendo una version cacheada corrupta o incompleta.
   Con `async` en el `<script>`, el timing de ejecucion no esta garantizado.

2. **Race condition en la hidratacion de React islands**: Astro 6 con
   `client:load` inyecta el JS de hidratacion como modulos ES. Si model-viewer
   (que es un Web Component) no ha terminado de registrar `customElements.define`
   cuando React monta el `<model-viewer>` en el DOM, el navegador trata el tag
   como un elemento desconocido. En hard reload, los tiempos de descarga son
   diferentes y el race condition puede no manifestarse.

3. **bfcache (Back-Forward Cache)**: Los navegadores modernos (Chrome 96+,
   Firefox 93+, Safari 13+) implementan bfcache, que congela y restaura paginas
   completas al navegar con back/forward. Si la pagina anterior quedo en bfcache
   con WebGL contexts activos, la nueva pagina puede heredar un estado de GPU
   corrupto. Astro no opta out de bfcache por defecto.

4. **Speculative preloading del navegador**: Incluso con `prefetch: false` en
   Astro, Chrome implementa speculative preloading nativo (no controlado por
   Astro) que puede pre-parsear el HTML de la pagina destino. Si este pre-parseo
   ejecuta scripts parcialmente, model-viewer puede quedar en un estado
   inconsistente.

**Conclusion del diagnostico**: El problema muy probablemente no es del
framework sino del **timing de carga del Web Component model-viewer** combinado
con los mecanismos de cache del navegador. Esto es importante porque si la causa
es esta, migrar de framework no resuelve el problema a menos que la nueva
arquitectura cambie fundamentalmente como se carga model-viewer.

---

## Alternativa 1: Mantener Astro, arreglar el problema

### Opciones no exploradas

**1.1 Mover model-viewer de CDN a bundle local**

Actualmente model-viewer se carga desde `ajax.googleapis.com` con `async`. Esto
introduce variabilidad en el timing. Si se instala como dependencia npm
(`@google/model-viewer`) e se importa desde el componente React que lo usa,
Astro lo incluiria en el bundle de la island. Esto garantiza que model-viewer
este definido como custom element ANTES de que React intente renderizar
`<model-viewer>` tags.

```
npm install @google/model-viewer
// En ModelCard.tsx o en un wrapper:
import '@google/model-viewer';
```

Beneficio: elimina la race condition entre CDN async y hidratacion de React.
Costo: aumenta el bundle JS de la island (~180KB gzip).

**1.2 Usar `client:idle` en vez de `client:load`**

`client:load` hidrata inmediatamente cuando el JS esta disponible. `client:idle`
espera a que el browser este idle (usa `requestIdleCallback`). Esto da mas
tiempo para que model-viewer se registre como custom element antes de que React
intente montar componentes que lo usan.

**1.3 Agregar un check de `customElements.whenDefined`**

En el componente React, antes de renderizar `<model-viewer>`, esperar a que el
custom element este registrado:

```typescript
const [mvReady, setMvReady] = useState(false);
useEffect(() => {
  customElements.whenDefined('model-viewer').then(() => setMvReady(true));
}, []);
```

Esto garantiza que el tag no se renderiza como elemento desconocido.

**1.4 Opt-out de bfcache**

Agregar en Layout.astro:
```html
<meta http-equiv="Cache-Control" content="no-store">
```
O usar el evento `pageshow` para forzar re-render:
```javascript
window.addEventListener('pageshow', (e) => {
  if (e.persisted) window.location.reload();
});
```

**1.5 Preload del script con mayor prioridad**

Reemplazar el script async por un preload + script con orden garantizado:
```html
<link rel="modulepreload" href="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js" />
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
```
Sin `async`, el script bloquea el parsing pero garantiza que model-viewer
este definido antes de cualquier hidratacion.

### Evaluacion

| Criterio | Valoracion |
|----------|-----------|
| Resuelve el problema WebGL/SVG en navegacion | Muy probable (opciones 1.1 + 1.3 combinadas) |
| Esfuerzo de migracion | Bajo (1-2 dias) |
| Compatibilidad Supabase | Total (sin cambios) |
| Compatibilidad GitHub Pages | Total (sin cambios) |
| Complejidad vs actual | Minima: se agrega una dependencia npm y un guard de custom element |
| Riesgo | Bajo: cambios quirurgicos, sin reestructuracion |

### Veredicto: RECOMENDADA como primera accion

---

## Alternativa 2: Next.js (App Router) con `output: export`

### Analisis

Next.js App Router con `output: 'export'` genera HTML estatico deployable en
GitHub Pages. El App Router usa React Server Components por defecto y client
components con la directiva `'use client'`.

**Navegacion**: Next.js implementa client-side navigation via su router. Al
hacer click en un `<Link>`, solo se descarga el RSC payload de la nueva ruta;
el layout compartido (incluyendo scripts de model-viewer) persiste en el DOM.
Esto significa que model-viewer se carga UNA vez y nunca se destruye al navegar.

**Pero**: el export estatico de Next.js para GitHub Pages tiene limitaciones
conocidas:

- No soporta middleware, ISR, ni API routes.
- Las rutas dinamicas requieren `generateStaticParams`.
- El basePath (`/galeria-3d-clase`) funciona pero necesita configuracion
  explicita en `next.config.js`.
- Supabase client-side funciona identico (es solo un cliente JS).

**Problema de model-viewer**: En Next.js, `<model-viewer>` sigue siendo un Web
Component externo. Si se carga via CDN, el mismo race condition con la
hidratacion de React puede ocurrir. Si se importa via npm como modulo ES dentro
de un `'use client'` component, Next.js lo incluye en el bundle del cliente y
el timing queda resuelto. Es decir, **la solucion es la misma que en Astro
(importar via npm)** pero con el beneficio adicional de que la navegacion
client-side no destruye el DOM compartido.

**SVG (HexagonChart)**: Los SVGs inline en React renderizan sin problemas en
Next.js. No hay diferencia con Astro en este aspecto.

### Esfuerzo de migracion

| Tarea | Estimacion |
|-------|-----------|
| Crear proyecto Next.js con App Router | 2 horas |
| Migrar Layout.astro a app/layout.tsx | 4 horas |
| Migrar pages (index, estudiantes, perfil) a app routes | 4 horas |
| Adaptar componentes React (ya son React puro) | 2 horas |
| Configurar Supabase client (mismo codigo) | 1 hora |
| Configurar GitHub Actions para export estatico | 4 horas |
| Configurar basePath y asset prefix | 2 horas |
| Testing completo | 8 horas |
| **Total estimado** | **~27 horas (3-4 dias)** |

### Evaluacion

| Criterio | Valoracion |
|----------|-----------|
| Resuelve el problema WebGL/SVG en navegacion | Si, por client-side routing |
| Esfuerzo de migracion | Medio (3-4 dias) |
| Compatibilidad Supabase | Total |
| Compatibilidad GitHub Pages | Si, con `output: export` |
| Complejidad vs actual | Mayor: RSC, `'use client'` boundaries, App Router conventions |
| Riesgo | Medio: cambio de framework completo, posibles edge cases en export |

### Veredicto: VIABLE pero desproporcionado para el problema actual

---

## Alternativa 3: Vite + React puro (SPA)

### Analisis

Una SPA pura con Vite + React + react-router elimina completamente el concepto
de navegacion entre paginas HTML. Todo vive en un unico `index.html`. La
navegacion es client-side via react-router, y el DOM nunca se destruye
completamente al cambiar de ruta.

**Navegacion**: Al ser SPA, model-viewer se carga una vez al inicio y el custom
element persiste. Las "paginas" son simplemente componentes React que se montan
y desmontan dentro de un layout compartido. Los `<model-viewer>` de la galeria
se desmontan al ir a estudiantes (porque cambia la ruta), pero el script de
model-viewer ya esta registrado globalmente.

**Ventajas**:
- Maxima simplicidad: sin SSG, sin hidratacion, sin islands.
- Los componentes React actuales migran con cambios minimos.
- Supabase client funciona identico.
- Vite tiene soporte nativo para GitHub Pages (`base` config).

**Desventajas**:
- Se pierde SSG: la pagina inicial es un shell vacio hasta que el JS carga.
- SEO: el HTML inicial no tiene contenido. Para una galeria academica esto
  puede no importar, pero es una regresion objetiva vs Astro.
- Bundle unico: todo el JS se descarga al inicio (~500KB+ estimado con
  model-viewer, React, Supabase, dnd-kit).
- No hay code splitting automatico por ruta (se puede configurar con lazy
  imports, pero requiere trabajo manual).

### Esfuerzo de migracion

| Tarea | Estimacion |
|-------|-----------|
| Crear proyecto Vite + React | 1 hora |
| Configurar react-router con rutas actuales | 2 horas |
| Mover Layout.astro a un componente React layout | 2 horas |
| Eliminar archivos .astro, adaptar imports | 3 horas |
| Mover CSS global y ajustar imports | 2 horas |
| Configurar GitHub Actions (build Vite) | 2 horas |
| Testing completo | 6 horas |
| **Total estimado** | **~18 horas (2-3 dias)** |

### Evaluacion

| Criterio | Valoracion |
|----------|-----------|
| Resuelve el problema WebGL/SVG en navegacion | Si, por client-side routing |
| Esfuerzo de migracion | Medio (2-3 dias) |
| Compatibilidad Supabase | Total |
| Compatibilidad GitHub Pages | Si (con `base` config) |
| Complejidad vs actual | Menor en runtime, mayor en bundle management |
| Riesgo | Bajo-medio: perdida de SSG, bundle grande |

### Veredicto: BUENA alternativa si Astro no funciona despues de intentar los fixes

---

## Alternativa 4: Remix / React Router v7

### Analisis

Remix (ahora fusionado con React Router v7) ofrece un modo SPA que genera
archivos estaticos. Sin embargo, su fortaleza principal es el server rendering
con loaders/actions, que no aplica para GitHub Pages.

En modo SPA, Remix se comporta esencialmente como Vite + React Router (porque
React Router v7 ES Remix). No hay ventaja arquitectonica significativa sobre la
Alternativa 3, pero si hay mas complejidad conceptual (loaders, actions,
conventions de archivos).

**Deploy en GitHub Pages**: El modo SPA de Remix genera un build estatico, pero
la documentacion oficial prioriza servidores Node/Deno. El soporte para export
estatico es mas reciente y menos probado que el de Next.js o Vite puro.

### Evaluacion

| Criterio | Valoracion |
|----------|-----------|
| Resuelve el problema WebGL/SVG en navegacion | Si (mismo que Alternativa 3) |
| Esfuerzo de migracion | Medio-alto (3-4 dias) |
| Compatibilidad Supabase | Total |
| Compatibilidad GitHub Pages | Posible pero menos documentado |
| Complejidad vs actual | Mayor: conventions de Remix sin beneficio de SSR |
| Riesgo | Medio: framework recien fusionado, menos estable para export estatico |

### Veredicto: NO RECOMENDADA — mismos beneficios que Vite+React pero mas complejidad

---

## Alternativa 5: Todo en una sola pagina (SPA dentro de Astro)

### Analisis

Eliminar `estudiantes.astro` y `perfil.astro`. Todo el contenido vive en
`index.astro` con un unico componente React gigante que maneja tabs o routing
interno (react-router en modo memory/hash).

**Navegacion**: No hay navegacion entre paginas. El usuario cambia de "seccion"
via tabs o un menu interno. model-viewer se carga una vez. Los SVGs nunca se
destruyen por navegacion.

**Ventajas**:
- Cero cambios en el build o deploy.
- model-viewer se carga una vez y persiste.
- Astro sigue generando un unico HTML con SSG.

**Desventajas**:
- Se pierde la URL como estado: no se puede compartir un link directo a
  `/estudiantes`. Se podria mitigar con hash routing (`#estudiantes`).
- El componente React se vuelve masivo: Gallery + Estudiantes + Perfil + Auth
  en un solo arbol. Esto degrada la mantenibilidad.
- El bundle JS de la island unica seria muy grande (~600KB+ estimado).
- Rompe el principio de Astro de "islands pequenas e independientes".
- La hidratacion inicial seria mas lenta porque todo el JS se carga junto.

### Esfuerzo de migracion

| Tarea | Estimacion |
|-------|-----------|
| Crear componente wrapper con tabs/router | 4 horas |
| Mover contenido de estudiantes y perfil al wrapper | 3 horas |
| Implementar hash routing para deep links | 2 horas |
| Eliminar paginas .astro extras | 1 hora |
| Testing completo | 4 horas |
| **Total estimado** | **~14 horas (2 dias)** |

### Evaluacion

| Criterio | Valoracion |
|----------|-----------|
| Resuelve el problema WebGL/SVG en navegacion | Si (no hay navegacion entre paginas) |
| Esfuerzo de migracion | Medio (2 dias) |
| Compatibilidad Supabase | Total |
| Compatibilidad GitHub Pages | Total |
| Complejidad vs actual | Menor en routing, mayor en tamano del componente |
| Riesgo | Medio: degradacion de mantenibilidad y performance inicial |

### Veredicto: ACEPTABLE como plan B, pero degrada la arquitectura

---

## Tabla comparativa final

| Criterio | 1. Fix Astro | 2. Next.js | 3. Vite+React | 4. Remix | 5. SPA en Astro |
|----------|:----------:|:---------:|:-------------:|:-------:|:--------------:|
| Resuelve el problema | Muy probable | Si | Si | Si | Si |
| Esfuerzo | 1-2 dias | 3-4 dias | 2-3 dias | 3-4 dias | 2 dias |
| Riesgo | Bajo | Medio | Bajo-medio | Medio | Medio |
| Mantiene SSG/SEO | Si | Si | No | No | Parcial |
| Mantiene URLs directas | Si | Si | Si | Si | Solo con hash |
| Mantiene arquitectura | Si | No | No | No | Parcial |
| Compatibilidad total | Si | Si | Si | Parcial | Si |

---

## Recomendacion estrategica

### Fase 1 (inmediata): Intentar fix en Astro — Opciones 1.1 + 1.3

1. Instalar `@google/model-viewer` como dependencia npm.
2. Importar desde el componente React (eliminar script CDN de Layout.astro).
3. Agregar guard `customElements.whenDefined('model-viewer')` en ModelCard.
4. Probar navegacion entre paginas.

Si esto resuelve el problema, no hay necesidad de migrar. El costo es minimo
y no hay deuda tecnica nueva.

### Fase 2 (solo si Fase 1 falla): Migrar a Vite + React SPA

Si el fix en Astro no resuelve el problema, la alternativa mas limpia es Vite +
React puro. Ofrece el mejor balance entre simplicidad, control total del
runtime, y compatibilidad con el stack existente. La perdida de SSG es aceptable
para una galeria academica.

### Fase 3 (futuro, si el proyecto escala): Considerar Next.js

Si el proyecto crece significativamente (mas paginas, necesidad de SEO real,
API routes), Next.js App Router seria la evolucion natural. Pero migrar ahora
seria sobre-ingenieria para el scope actual.

### No recomendadas

- **Remix/RR v7**: mismos beneficios que Vite+React con mas complejidad y menos
  estabilidad en export estatico.
- **SPA en Astro**: resuelve el sintoma pero degrada la arquitectura al concentrar
  todo en un solo componente monolitico.

---

## Nota sobre el problema de SVG

El `HexagonChart` es un componente React puro que genera SVG inline. No depende
de Web Components ni de scripts externos. Si el SVG no renderiza en navegacion
pero si en hard reload, el problema es identico al de model-viewer: la
hidratacion de la React island no se completa correctamente. El fix de la Fase 1
(asegurar que las islands se hidratan completamente) deberia resolver ambos
problemas simultaneamente.

Si el SVG sigue fallando despues del fix de model-viewer, el problema esta en
como Astro re-ejecuta las islands en navegacion con cache, y seria un bug de
Astro mismo (no de la aplicacion).
