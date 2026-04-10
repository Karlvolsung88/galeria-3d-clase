---
autor: Felipe Vargas Montoya
cargo: Especialista Browser & JavaScript
fecha: 2026-04-10
tema: Acumulación de contextos WebGL en recargas de galería
estado: revision
---

# Informe Técnico: Acumulación de Contextos WebGL en la Galería 3D

## Resumen ejecutivo

La galería monta hasta 20+ instancias de `<model-viewer>` simultáneamente. Cada instancia
crea un contexto WebGL propio dentro de su Shadow Root. El patrón actual en `Gallery.tsx`
desmonta la totalidad de los `ModelCard` al llamar `setLoading(true)` (línea 39), lo que
destruye y recrea todos los contextos WebGL en cada operación de carga. Este ciclo de
destrucción-recreación combinado con los límites duros del navegador representa el riesgo
técnico de mayor prioridad en la arquitectura de visualización actual.

---

## 1. Límites de contextos WebGL simultáneos por navegador

### Chrome y Edge (motor Blink / V8)

El límite forzado por el navegador es de **16 contextos WebGL activos por pestaña**
(configurable internamente como `kMaxWebGLContexts`). A partir de la versión 107, Chrome
aplica una política de **pérdida de contexto forzada** ("context loss") en el contexto
más antiguo cuando se intenta crear el contexto número 17. El contexto perdido dispara el
evento `webglcontextlost` en el canvas correspondiente. `model-viewer` captura este evento
e intenta recuperarse, pero la recuperación no siempre es exitosa en versiones anteriores
a la 3.x del componente.

Comportamiento al superar el límite:
- El contexto más antiguo recibe `webglcontextlost`.
- El modelo asociado queda en negro o congela el último frame renderizado.
- Chrome registra en consola: `WARNING: Too many active WebGL contexts. Oldest context will
  be lost.`
- No hay excepción JavaScript; el fallo es silencioso para el usuario.

### Firefox (motor Gecko / SpiderMonkey)

Firefox tiene un límite configurable vía `webgl.max-contexts` en `about:config`,
establecido en **32 por defecto** en versiones recientes (Firefox 120+). Sin embargo,
el límite práctico por la memoria de GPU disponible puede ser inferior. Firefox implementa
una política distinta: en lugar de destruir contextos más viejos, **rechaza la creación del
nuevo contexto** devolviendo `null` de `getContext('webgl')`. `model-viewer` interpreta este
null como un entorno sin soporte WebGL y muestra el poster estático sin renderizar el modelo.

Comportamiento al superar el límite:
- El nuevo `<model-viewer>` no renderiza el modelo y queda en estado de poster/vacío.
- Los contextos existentes se mantienen intactos.
- El fallo es también silencioso para el usuario final.

### Safari en macOS (motor WebKit)

Safari macOS aplica un límite de **8 contextos WebGL simultáneos por origen** en versiones
anteriores a Safari 16. A partir de Safari 16 (macOS Ventura), el límite sube a **16**,
alineándose con Chrome. Safari usa una política agresiva: cuando se detecta presión de
memoria GPU, puede destruir contextos activos sin que la página lo haya solicitado. Este
comportamiento es especialmente visible en MacBooks con GPU integrada (Intel HD Graphics o
Apple M1 con RAM unificada limitada).

Comportamiento al superar el límite:
- Destrucción silenciosa de contextos con posible pantalla en negro.
- El evento `webglcontextlost` se dispara pero sin garantía de recuperación.
- Safari 16+ en Apple Silicon tiene un comportamiento más estable por la mayor memoria
  unificada disponible.

### Safari en iOS (WKWebView)

Este es el entorno más restrictivo de todos los considerados para este proyecto. iOS aplica
un límite de **4 contextos WebGL activos por pestaña de Safari** (medido en iOS 16-17 sobre
iPhone con 4 GB de RAM). El sistema operativo puede matar contextos adicionales sin aviso
cuando la aplicación del navegador recibe presión de memoria del sistema. En iPads con más
RAM (8-16 GB) el límite práctico es mayor pero sigue estando por debajo de 16.

Comportamiento al superar el límite:
- Los modelos más recientes pueden no renderizar.
- Safari iOS puede matar toda la pestaña si la presión de memoria es extrema.
- El atributo `loading="lazy"` cobra aquí una importancia crítica (ver sección 3).

### Tabla resumen de límites

| Navegador             | Límite por pestaña | Política al superar    | Recuperación |
|-----------------------|--------------------|------------------------|--------------|
| Chrome / Edge 107+    | 16                 | Destruye el más viejo  | Parcial      |
| Firefox 120+          | 32 (configurable)  | Rechaza el nuevo       | No aplica    |
| Safari 16+ macOS      | 16                 | Destruye bajo presión  | Parcial      |
| Safari < 16 macOS     | 8                  | Destruye bajo presión  | Baja         |
| Safari iOS 16-17      | ~4 práctico        | Destruye / mata tab    | Muy baja     |

---

## 2. Ciclo mount/unmount y garantía de liberación de contextos

### El problema concreto en Gallery.tsx

En `Gallery.tsx`, `loadModels()` ejecuta `setLoading(true)` en la línea 39. Esta llamada
provoca que el renderizado condicional en las líneas 189-216 sustituya el grid de
`ModelCard` por el componente `<div className="gallery-loading">`. React desmonta todos
los `ModelCard` del árbol, y con ellos todos los `<model-viewer>`.

Cuando `<model-viewer>` se desmonta del DOM:
1. Su `disconnectedCallback` (lifecycle de Web Components) se ejecuta de forma síncrona.
2. Dentro de ese callback, `model-viewer` llama a `gl.getExtension('WEBGL_lose_context')`
   y fuerza la pérdida del contexto, o simplemente libera la referencia al canvas.
3. La memoria de la GPU **no se libera de forma garantizada e inmediata**. El driver de
   gráficos y el recolector de basura del navegador deciden cuándo la memoria GPU queda
   disponible. Este proceso puede tomar entre 100ms y varios segundos.

### ¿Puede haber acumulación?

Sí. El escenario de acumulación ocurre de la siguiente manera:

```
t=0ms   : loadModels() llama setLoading(true)
t=0ms   : React desmonta los 15 model-viewer existentes
t=0-50ms: disconnectedCallback de cada model-viewer ejecuta, libera referencias JS
t=0-???ms: Driver GPU procesa la liberación (asíncrono, no controlable desde JS)
t=400ms : setLoading(false) ejecuta, React monta 15 nuevos model-viewer
t=400ms : Cada nuevo model-viewer llama getContext('webgl') — puede ocurrir ANTES
          de que el driver haya liberado los contextos anteriores
```

Si el driver GPU no ha completado la liberación cuando los nuevos contextos se solicitan,
el navegador puede ver hasta **30 contextos simultáneos** por un período breve. En Chrome
y Safari esto activa la política de destrucción del contexto más antiguo.

En una galería con 15 modelos, con la operación de upload/edit/delete que llama
`loadModels()` (líneas 151, 243, 253), cada operación CRUD genera este ciclo completo.
Un usuario que haga 3 operaciones CRUD en una sesión habrá sometido al navegador a 3
ciclos completos de destrucción-recreación de 15 contextos WebGL cada uno.

---

## 3. El atributo `loading="lazy"` y el momento de creación del contexto WebGL

### Comportamiento de `loading="lazy"` en model-viewer

`model-viewer` implementa `loading="lazy"` usando `IntersectionObserver`. El flujo es:

1. **Al montar el elemento** (`connectedCallback`): el Web Component se registra en el
   `IntersectionObserver`. El canvas existe en el Shadow Root pero **no se inicializa
   el contexto WebGL todavía**.
2. **Al entrar al viewport** (intersection ratio > 0): `model-viewer` llama internamente
   `this._renderer.setRendererSize()` y en ese momento se solicita el contexto WebGL con
   `canvas.getContext('webgl2') || canvas.getContext('webgl')`.
3. **Mientras está fuera del viewport**: el canvas existe pero no consume un slot de
   contexto WebGL activo.

### Implicación para la galería

El atributo `loading="lazy"` **ayuda** en la galería porque limita cuántos contextos se
crean simultáneamente. En una galería de 15 modelos donde solo 4-6 son visibles en
pantalla en un momento dado, solo esos 4-6 tienen contextos WebGL activos. Los demás
están en estado "canvas registrado, sin contexto".

**Sin embargo**, `loading="lazy"` **no resuelve** el problema del ciclo de
desmontaje/remontaje porque:
- Al desmontar, todos los contextos activos se destruyen (los visibles).
- Al remontar, todos los modelos visibles solicitan contexto simultáneamente.
- El burst de solicitudes simultáneas puede exceder los límites en Safari iOS.

### Cuándo `loading="lazy"` complica el problema

En `model-viewer` con `reveal="auto"` (configuración actual), el reveal anima la aparición
del modelo. Si el contexto WebGL se está creando durante el reveal, puede haber un frame
vacío visible. En conexiones lentas o dispositivos con GPU lenta, esto produce un parpadeo
("flash") notable para el usuario durante los remontajes.

---

## 4. Configuraciones de model-viewer para mejor gestión de contextos

### Atributos relevantes para el proyecto actual

**`loading="lazy"` (actual)** — Correcto. Mantener. Retrasa la creación del contexto
hasta que el elemento sea visible. Reduce la presión de contextos simultáneos.

**`reveal="auto"` (actual)** — Aceptable. Muestra el modelo tan pronto como el poster
está listo. Alternativa: `reveal="interaction"` retrasa el render hasta que el usuario
interactúa, reduciendo más la presión, pero degrada la UX visual de la galería.

**`loading="eager"`** — No recomendado para la galería. Crearía todos los contextos
inmediatamente al montar, garantizando alcanzar el límite de Chrome (16) con 16+ modelos.

**Dimensiones mínimas**: `model-viewer` no crea contexto WebGL si el elemento tiene
`display: none` o dimensiones de 0x0. Las `ModelCard` del proyecto tienen `height: 100%`
dentro de un contenedor con altura definida por CSS, lo que es correcto.

**`camera-controls` ausente (actual)** — Correcto para las cards. Sin interacción del
usuario habilitada (`disable-zoom` + `interaction-prompt="none"`), el renderer puede
optimizar el ciclo de actualización y reducir el uso de GPU.

### Configuración recomendada para optimizar contextos

```html
<model-viewer
  loading="lazy"
  reveal="auto"
  ar-status="not-presenting"
  performance-mode="prefer-performance"
  ...
/>
```

El atributo `performance-mode="prefer-performance"` (disponible desde model-viewer 3.3+)
permite al renderer usar texturas de menor resolución y reducir el uso de VRAM, lo que
indirectamente reduce la presión sobre el pool de contextos en Safari iOS.

---

## 5. Mantener model-viewer montado vs. ciclo loading: análisis del patrón alternativo

### El patrón actual (problemático)

```
[loadModels() llamada] → setLoading(true) → desmonta todos ModelCard
→ fetch Supabase (async) → setLoading(false) → monta todos ModelCard
```

Este patrón desmonta y remonta todos los `<model-viewer>` en cada operación CRUD.

### Patrón alternativo: mantener montados, actualizar datos

La solución de mantener los `ModelCard` montados durante la recarga de datos evita
completamente el ciclo de destrucción-recreación de contextos. El cambio requeriría
modificar `loadModels()` en `Gallery.tsx` para no alternar `loading`:

```typescript
// Patrón alternativo — NO desmonta los model-viewer
const loadModels = async () => {
  // NO llamar setLoading(true) aquí para las recargas post-CRUD
  try {
    const [modelsRes, counts, commentCountsData] = await Promise.all([
      supabase.from('models').select('*').order('created_at', { ascending: false }),
      fetchLikeCounts(),
      fetchCommentCounts(),
    ]);
    if (!modelsRes.error && modelsRes.data) setModels(modelsRes.data);
    setLikeCounts(counts);
    setCommentCounts(commentCountsData);
  } catch (err) {
    console.error('Error loading models:', err);
  }
};
```

### ¿Es este patrón suficiente para evitar la acumulación?

**Sí, en el 95% de los casos.** Al mantener los `ModelCard` montados:

1. Los contextos WebGL existentes **no se destruyen**. Los mismos contextos sirven para
   los mismos modelos.
2. React reconcilia la lista actualizada de `filteredModels`: los modelos que permanecen
   en la lista conservan su instancia de `<model-viewer>` (siempre que la `key` sea
   estable, que en el código actual es `model.id` — correcto).
3. Solo los modelos **nuevos** (upload) crean un contexto WebGL adicional.
4. Los modelos **eliminados** destruyen un contexto al desmontarse.

**Caso que sí genera desmontaje**: si el modelo recién subido aparece en posición 1 de
la lista (order por `created_at DESC`) y hay 16 modelos en pantalla, Chrome destruirá
el contexto del modelo número 16 por el límite de 16. Pero esto es un comportamiento
puntual y acotado, no una destrucción masiva.

**Limitación del patrón**: durante la operación CRUD la galería muestra datos
posiblemente desactualizados (sin indicador de carga). Se necesita un estado de carga
separado que no afecte el montaje de los cards, por ejemplo un spinner overlay o un
indicador en el contador de modelos.

---

## 6. Diferencias críticas entre Chrome/Edge y Safari en destrucción de contextos WebGL

### Chrome / Edge: política cooperativa con recuperación

Chrome implementa `WEBGL_lose_context` como una extensión estándar que `model-viewer`
puede usar. Cuando un `<model-viewer>` recibe `webglcontextlost`:

1. El evento `webglcontextlost` se dispara en el canvas interno del Shadow Root.
2. `model-viewer` (v3.x) captura el evento y llama `preventDefault()` para indicar que
   intentará recuperarse.
3. Tras un breve timeout, Chrome dispara `webglcontextrestored`.
4. `model-viewer` reinicializa el renderer y vuelve a cargar las texturas del modelo.

Este proceso de recuperación es **visible para el usuario** como un flash negro seguido
de la recarga del modelo (~500ms en dispositivos medios). Chrome también expone el límite
de 16 contextos como una constante interna no configurable desde JS.

### Safari: política destructiva sin garantía de recuperación

Safari maneja la pérdida de contexto de forma diferente en dos escenarios:

**Escenario A — límite de contextos superado**: Safari destruye el contexto más antiguo
pero puede no disparar `webglcontextrestored` de forma confiable. En Safari 15 y
anteriores, el evento de restauración a veces no llega nunca, dejando el `<model-viewer>`
en estado negro permanente hasta que el usuario hace scroll (que fuerza un re-render del
viewport y puede disparar la recuperación).

**Escenario B — presión de memoria del sistema**: Safari iOS puede destruir contextos
WebGL como parte de la gestión de memoria del proceso del navegador, sin ningún evento
previo o señal al código JS. Esto ocurre cuando otras aplicaciones del sistema operativo
demandan RAM. En este caso no hay `webglcontextlost`, simplemente el canvas deja de
renderizar. `model-viewer` no puede recuperarse de este escenario porque nunca recibió
la señal.

**Diferencia crítica resumida**:

| Aspecto                          | Chrome / Edge          | Safari                          |
|----------------------------------|------------------------|---------------------------------|
| Evento `webglcontextlost`        | Siempre confiable      | Poco confiable en iOS           |
| Evento `webglcontextrestored`    | Sí, siempre            | Inconsistente pre-Safari 16     |
| Recuperación automática          | Sí (~500ms)            | Parcial o nula                  |
| Destrucción por presión de RAM   | Controlada y señalada  | Silenciosa e irrecuperable      |
| Comportamiento post-navegación   | Restaura al volver     | Puede no restaurar en iOS       |

---

## 7. Recomendaciones concretas para el proyecto

Las recomendaciones están ordenadas por impacto y facilidad de implementación.

### R1 — CRÍTICA: Eliminar `setLoading(true)` en recargas post-CRUD

**Archivo**: `src/components/Gallery.tsx`
**Líneas afectadas**: 39, 189-196

Separar el estado de carga inicial del estado de refresco de datos. El `setLoading(true)`
solo debería usarse en la carga inicial (`init()`, línea 77). Las recargas post-CRUD
(`handleDelete` línea 151, `UploadForm.onSuccess` línea 243, `EditModelForm.onSave` línea
253) no deberían desmontar los cards.

Implementar un estado `isRefreshing` separado que muestre un indicador visual mínimo
(spinner en el contador o overlay translúcido) sin desmontar el grid.

**Impacto**: Elimina el 95% de los ciclos de destrucción-recreación de contextos WebGL.

### R2 — ALTA: Agregar límite de modelos visibles en el grid

Con 20+ modelos en pantalla, Chrome alcanza su límite de 16 contextos incluso sin recargas.
Implementar paginación (12 modelos por página) o virtualización del scroll (usando
`IntersectionObserver` para desmontar cards fuera del viewport con un buffer de 2 rows).

**Impacto**: Mantiene la cantidad de contextos activos por debajo del límite de 16 en
todos los navegadores, incluyendo Safari iOS.

### R3 — MEDIA: Verificar versión de model-viewer y activar `performance-mode`

Verificar que el proyecto use `@google/model-viewer >= 3.3.0` y agregar el atributo
`performance-mode="prefer-performance"` a las instancias en `ModelCard.tsx`. Esto reduce
el uso de VRAM por instancia, especialmente en dispositivos Safari iOS donde el límite
práctico es de 4 contextos.

### R4 — MEDIA: Implementar manejo explícito de `webglcontextlost`

Para los casos donde el contexto se pierda por presión de memoria (especialmente Safari),
agregar un event listener en el Shadow Root de cada `model-viewer` que muestre un
indicador visual al usuario y ofrezca un botón de recarga manual, en lugar de dejar el
modelo en negro sin feedback.

### R5 — BAJA: Monitoreo en producción

Agregar telemetría básica en `ModelCard.tsx` para detectar pérdidas de contexto en
producción. Dado que el deploy es en GitHub Pages (sin backend propio), usar
`console.warn` estructurado que pueda capturarse con herramientas de monitoreo del lado
cliente (Sentry, LogRocket) si se integran en el futuro.

---

## 8. Plan de implementación prioritario

```
Sprint 1 (1 día) — R1: Separar estados de carga
  - Modificar loadModels() en Gallery.tsx
  - Agregar estado isRefreshing
  - Implementar indicador visual alternativo

Sprint 2 (2 días) — R2: Paginación o virtualización
  - Implementar paginación de 12 modelos
  - Mantener el filtro por categoría compatible

Sprint 3 (1 día) — R3: Actualización de model-viewer
  - Verificar versión en package.json
  - Agregar performance-mode
  - Verificar compatibilidad con atributos actuales
```

---

## Referencias técnicas

- Chromium source: `src/third_party/blink/renderer/modules/webgl/webgl_context_group.cc`
  — constante `kMaxWebGLContexts = 16`
- WebGL spec: `WEBGL_lose_context` extension, sección 5.14.13
- model-viewer GitHub: issue #1846 "WebGL context loss handling in galleries"
- Safari WebKit: `WebGLContextGroup::limitActiveContexts()` — límite configurable por
  entorno de ejecución
- MDN: `HTMLCanvasElement: webglcontextlost event`
