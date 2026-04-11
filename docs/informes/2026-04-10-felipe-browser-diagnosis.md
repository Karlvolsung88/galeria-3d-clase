---
autor: Felipe Vargas Montoya
cargo: Especialista Browser & JavaScript
fecha: 2026-04-10
tema: Diagnóstico — Navegación entre páginas no renderiza WebGL/SVG en Chrome del usuario
estado: revision
---

# Diagnóstico: Navegación estándar no renderiza model-viewer ni HexagonChart SVG

## Resumen ejecutivo

El síntoma reportado es: al navegar entre Galería y Estudiantes usando los links del
nav, los `<model-viewer>` 3D y los gráficos SVG `HexagonChart` no renderizan. Hard
reload (Ctrl+Shift+R) sí los carga correctamente. Un browser MCP limpio no presenta
el problema. El Chrome del usuario falla incluso con todas las extensiones desactivadas.

Tras analizar los 6 archivos clave, el HTML estático generado, la configuración de
Astro, el pipeline de deploy, y los mecanismos de caché del navegador, mi diagnóstico
apunta a **bfcache (Back/Forward Cache) de Chrome** como la causa raíz más probable,
con **paint holding** como factor secundario agravante. El problema NO está en Astro
ni en el código de la aplicación.

---

## 1. Descarte de hipótesis previas

### 1.1 Speculation Rules API / Prefetch de Astro

La entrada del CHANGELOG atribuye el problema original a la Speculation Rules API de
Astro 6 (`prefetch` habilitado por defecto). El fix aplicado fue `prefetch: false` en
`astro.config.mjs`.

**Estado actual verificado:**
- `astro.config.mjs` tiene `prefetch: false` (línea 9).
- El HTML generado en `dist/index.html` y `dist/estudiantes/index.html` NO contiene
  ningún `<script type="speculationrules">`.
- No hay tags `<link rel="prefetch">` ni `<link rel="prerender">` en el output.

**Conclusión:** La Speculation Rules API está completamente desactivada. Si el
problema persiste, la causa es otra.

### 1.2 ClientRouter / ViewTransitions

ClientRouter fue removido deliberadamente. El HTML generado usa navegación estándar
con links `<a href="...">`. No hay `astro:transitions`, no hay swap de página SPA.
Cada click en un link del nav debería producir una navegación completa con descarga
de un nuevo documento HTML.

**Conclusión:** ClientRouter no es un factor. Descartado.

### 1.3 Service Workers

No existe ningún Service Worker registrado en el proyecto. No hay archivos `sw.js`,
no hay Workbox, no hay PWA manifest. GitHub Pages no inyecta Service Workers propios.

**Conclusión:** No hay interceptación de requests por SW. Descartado.

---

## 2. Hipótesis principal: bfcache (Back/Forward Cache)

### 2.1 Qué es bfcache

Chrome implementa bfcache (Back/Forward Cache) desde la versión 96. Es un mecanismo
que almacena una instantánea completa de la página en memoria cuando el usuario navega
fuera de ella. Si el usuario vuelve a esa página (con el botón Back, Forward, o en
ciertos casos con link navigation dentro del mismo sitio), Chrome puede restaurar la
instantánea en lugar de hacer un fetch + parse + render completo.

La clave: **bfcache NO re-ejecuta scripts**. Restaura el estado del DOM exactamente
como estaba en el momento de la navegación, incluyendo el estado de los Web Components,
pero **sin reinicializar contextos WebGL, sin re-ejecutar `connectedCallback`, y sin
re-triggerar `IntersectionObserver` callbacks**.

### 2.2 Por qué bfcache afecta a model-viewer

Cuando una página con `<model-viewer>` se almacena en bfcache:

1. El contexto WebGL del canvas dentro del Shadow Root de `<model-viewer>` se
   **congela**. El estado de la GPU no se preserva en la instantánea de memoria.
2. Al restaurar desde bfcache, el DOM del `<model-viewer>` existe (es visible en el
   inspector) pero su canvas WebGL está en estado "context lost" o "frozen".
3. `model-viewer` no recibe `connectedCallback` porque el elemento nunca se desmontó
   del DOM — simplemente se congeló y descongeló.
4. El evento `webglcontextrestored` puede o no dispararse dependiendo de la versión
   de Chrome y del driver GPU.
5. El resultado visible: el `<model-viewer>` aparece como un rectángulo vacío o negro.

### 2.3 Por qué bfcache afecta a HexagonChart SVG

Los SVG generados por React (como HexagonChart) dependen de la hidratación de Astro
islands. Cuando Chrome restaura desde bfcache:

1. El HTML del SVG está presente en el DOM (fue parte de la instantánea).
2. Pero el componente React que lo generó **no se re-hidrata**. El script de
   hidratación de Astro (`astro:load` event) no se re-dispara.
3. Si el SVG fue renderizado por React durante la hidratación inicial y luego la
   página se almacenó en bfcache antes de que React completara el commit al DOM,
   el SVG puede quedar incompleto o invisible.
4. Más probable: si el estado de React (`students`, `skills`) se cargó async desde
   Supabase y el componente estaba en estado `loading: true` cuando se congeló, al
   restaurar sigue en ese estado sin que el `useEffect` se re-ejecute.

### 2.4 Por qué hard reload funciona

Ctrl+Shift+R (hard reload) invalida todas las cachés incluyendo bfcache. Chrome
descarga el HTML fresco, parsea desde cero, ejecuta todos los scripts, hidrata los
islands, y `model-viewer` crea nuevos contextos WebGL. Todo funciona porque es un
ciclo de vida completo.

### 2.5 Por qué el browser MCP limpio no falla

Un browser limpio (perfil nuevo, sin historial) tiene bfcache vacío. La primera
navegación a cualquier página es siempre un fetch completo. El problema solo aparece
cuando hay una página previa almacenada en bfcache para la misma URL.

Además, Chrome tiene heurísticas sobre cuándo usar bfcache. Un perfil con mucha
actividad, tabs abiertas, y presión de memoria puede tener comportamientos de bfcache
diferentes a un perfil limpio.

### 2.6 Evidencia circunstancial que apoya esta hipótesis

- El problema aparece al navegar **entre las dos páginas del sitio** (Galería y
  Estudiantes). Esto es exactamente el patrón de uso que bfcache optimiza.
- El problema NO aparece en la primera visita a cualquier página.
- Hard reload lo resuelve (invalida bfcache).
- Desactivar extensiones no lo resuelve (bfcache es una feature del engine, no de
  las extensiones).
- El HTML es estático y correcto (verificado en dist/).

---

## 3. Hipótesis secundaria: Paint Holding

### 3.1 Qué es paint holding

Chrome degrada un comportamiento complementario llamado "paint holding" que afecta
las navegaciones entre páginas del mismo origen. Cuando el usuario hace click en un
link que apunta al mismo sitio (same-origin), Chrome puede mantener la pintura de la
página anterior visible mientras la nueva página se carga, para evitar un flash blanco.

### 3.2 Cómo interactúa con model-viewer

Durante paint holding:

1. Chrome empieza a parsear el HTML de la nueva página **en background**.
2. Los scripts comienzan a ejecutarse pero la composición visual aún muestra la
   página anterior.
3. `model-viewer` solicita su contexto WebGL pero el compositor no ha asignado
   las capas de GPU todavía.
4. Si `model-viewer` solicita `getContext('webgl')` durante esta fase, puede recibir
   un contexto válido pero que no está conectado a una superficie de composición
   visible.
5. Cuando paint holding termina y la nueva página se muestra, el contexto WebGL puede
   no tener su primera frame renderizada.

### 3.3 Por qué paint holding por sí solo no es suficiente

Paint holding normalmente tiene un timeout corto (varios cientos de milisegundos). Si
el problema fuera solo paint holding, el model-viewer debería auto-recuperarse después
de ese timeout porque su loop de render sigue activo. El hecho de que el usuario tenga
que hacer hard reload sugiere que bfcache es el factor principal y paint holding puede
ser un agravante en ciertas transiciones.

---

## 4. Análisis del stack: responsabilidad por capa

### 4.1 Astro (framework)

**No es responsable del bug.** Astro genera HTML estático correcto. Las páginas en
`dist/` son documentos HTML completos e independientes. No hay lógica de Astro que
interfiera con la navegación entre páginas. El script de hidratación de islands
(`astro:load`) se ejecuta correctamente en cargas normales.

Sin embargo, Astro **no implementa** ninguna mitigación contra bfcache. No hay
`pageshow` listener, no hay `Cache-Control: no-store` header, no hay
`<meta http-equiv="Cache-Control">`.

### 4.2 React islands (client:load)

**Parcialmente afectado.** Los islands React se hidratan via `astro-island` custom
element, que ejecuta su lógica en `connectedCallback`. Si la página se restaura
desde bfcache, `connectedCallback` no se re-ejecuta. Esto significa:

- `useEffect` hooks no se re-disparan.
- El estado async (fetch de Supabase) no se re-ejecuta.
- El componente queda congelado en el estado que tenía al momento de la congelación.

Si el componente estaba en `initialLoading: true` (esperando la respuesta de
Supabase) cuando se congeló, queda atascado mostrando "Cargando modelos..." para
siempre.

### 4.3 model-viewer (Web Component)

**Directamente afectado.** model-viewer depende de WebGL context que no sobrevive
bfcache. El componente implementa manejo de `webglcontextlost` pero no implementa
detección de restauración desde bfcache vía `pageshow` event.

Versión en uso: 3.4.0 (verificado en Layout.astro línea 38). Esta versión tiene
mejoras en context loss recovery pero no tiene mitigación explícita de bfcache.

### 4.4 Chrome (browser)

**Es donde reside el mecanismo que causa el problema.** bfcache es un feature de
Chrome que funciona correctamente según su diseño. El problema es que las páginas
con WebGL y React islands no son compatibles con bfcache sin mitigación explícita
por parte del desarrollador.

---

## 5. Verificación propuesta

Para confirmar esta hipótesis de forma definitiva, se necesitan las siguientes pruebas
en el Chrome del usuario:

### Test 1: Verificar bfcache con DevTools

1. Abrir DevTools > Application > Back/Forward Cache.
2. Navegar de Galería a Estudiantes.
3. Verificar si la página anterior se almacenó en bfcache.
4. Chrome muestra "Restored from back/forward cache" en la sección de navegación.

### Test 2: Verificar el evento `pageshow`

Inyectar en la consola del browser:

```javascript
window.addEventListener('pageshow', (event) => {
  console.log('[pageshow] persisted:', event.persisted);
  if (event.persisted) {
    console.log('[pageshow] ESTA PÁGINA FUE RESTAURADA DESDE BFCACHE');
  }
});
```

Navegar a otra página y volver. Si `event.persisted` es `true`, la página se restauró
desde bfcache y esa es la causa del problema.

### Test 3: Forzar opt-out de bfcache

Agregar temporalmente al `<head>` de Layout.astro:

```html
<meta http-equiv="Cache-Control" content="no-store" />
```

O alternativamente, registrar un listener que fuerce recarga:

```javascript
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});
```

Si el problema desaparece con cualquiera de estas mitigaciones, bfcache queda
confirmado como causa raíz.

### Test 4: Desactivar bfcache en Chrome flags

Navegar a `chrome://flags/#back-forward-cache` y desactivarlo. Si el problema
desaparece, la confirmación es definitiva.

---

## 6. Direcciones de solución (sin código, solo estrategias)

Si la hipótesis se confirma, hay tres estrategias de mitigación ordenadas de menos a
más invasiva:

### Estrategia A: Opt-out de bfcache

Agregar un `pageshow` listener global que fuerce `location.reload()` cuando
`event.persisted` es `true`. Es la solución más simple pero sacrifica el beneficio
de performance de bfcache.

### Estrategia B: Re-inicialización selectiva desde `pageshow`

Detectar restauración desde bfcache con `pageshow` y forzar la re-hidratación de los
islands React y la re-inicialización de model-viewer sin recargar la página completa.
Es más complejo pero preserva el estado de la UI parcialmente.

### Estrategia C: Cache-Control headers

Configurar GitHub Pages (o un `_headers` file) para enviar
`Cache-Control: no-store` en los HTML, previniendo que Chrome almacene las páginas
en bfcache. Esto no es posible directamente con GitHub Pages estándar pero sí con
un middleware de CDN o con headers de Cloudflare si se usa proxy.

---

## 7. Por qué este problema no se manifiesta en todos los Chrome

bfcache tiene condiciones de elegibilidad. Una página NO se almacena en bfcache si:

- Tiene un `unload` event listener registrado.
- Tiene un `beforeunload` listener que llama `preventDefault()`.
- Tiene un `Cache-Control: no-store` header.
- Tiene una conexión WebSocket activa.
- Tiene un Service Worker activo con fetch handler.

El Chrome del usuario puede tener bfcache habilitado por defecto con todas las
condiciones de elegibilidad cumplidas. Un Chrome limpio o con ciertas configuraciones
de empresa puede tener bfcache desactivado o con heurísticas más conservadoras.

Adicionalmente, el comportamiento de bfcache con WebGL ha cambiado entre versiones
de Chrome. En versiones recientes (120+), Chrome intenta ser más agresivo con bfcache
incluso en páginas con WebGL, lo que puede explicar por qué el problema apareció
recientemente.

---

## 8. Conclusión

| Factor | Rol en el problema | Nivel de certeza |
|--------|-------------------|------------------|
| bfcache de Chrome | Causa raíz principal | Alto (pendiente test 1-4) |
| Paint holding | Factor agravante secundario | Medio |
| Astro framework | No responsable | Confirmado |
| React hydration | Afectado (no se re-ejecuta) | Alto |
| model-viewer WebGL | Afectado (context lost) | Alto |
| Speculation Rules | Descartado (ya desactivado) | Confirmado |
| ClientRouter | Descartado (ya removido) | Confirmado |
| Service Workers | Descartado (no existen) | Confirmado |
| Extensiones Chrome | Descartado (persiste sin ellas) | Confirmado |

La combinación de bfcache + React islands que no se re-hidratan + model-viewer WebGL
que no restaura su contexto produce el síntoma exacto reportado: navegación normal no
renderiza, hard reload sí.

Los tests propuestos en la sección 5 confirmarán la hipótesis de forma definitiva.
Recomiendo ejecutarlos en el Chrome del usuario antes de implementar cualquier
solución.
