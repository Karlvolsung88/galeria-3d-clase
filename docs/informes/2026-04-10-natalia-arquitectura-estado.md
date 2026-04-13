---
autor: Natalia Vargas Ospina
cargo: Arquitecta Web
fecha: 2026-04-10
tema: Arquitectura Canvas compartido — View de drei vs Canvas individual
estado: revision
---

## Resumen ejecutivo

Con 13 tarjetas, cada `ModelCard` crea su propio `<Canvas>` R3F. Chrome limita ~16 contextos WebGL simultaneos; al superar ese umbral, los contextos se pierden (`THREE.WebGLRenderer: Context Lost`). Los modelos con texturas PBR grandes (4-16 MB) agravan el problema porque cada contexto reserva GPU memory para sus texturas de forma independiente, sin compartir recursos entre Canvas.

La solucion es migrar a un unico `<Canvas>` global con el componente `View` de `@react-three/drei`, que usa scissor testing para renderizar multiples viewports independientes dentro de un solo contexto WebGL.

---

## 1. Diagnostico de la arquitectura actual

### 1.1 Flujo actual

```
Gallery.tsx
  └─ filteredModels.map(model =>
       <ModelCard>
         <Canvas>                    ← contexto WebGL #N
           <ModelScene>
             <Environment preset="studio" />
             <Model3D url={...} />   ← useGLTF carga GLB + texturas
             <OrbitControls />
           </ModelScene>
         </Canvas>
       </ModelCard>
     )

ModelModal.tsx (al abrir)
  └─ <Canvas>                        ← contexto WebGL #N+1
       <ModelScene url={...} />
     </Canvas>
```

### 1.2 Recursos por Canvas

Cada `<Canvas>` individual crea:
- 1 WebGLRenderer (1 contexto WebGL)
- 1 Environment map (studio preset) cargado independientemente
- 1 instancia de Draco decoder
- Texturas PBR propias (no compartidas entre Canvas)
- 1 set de luces (ambient + 2 directional)

Con 13 cards + 1 modal = 14 contextos potenciales. Chrome pierde contextos a partir de ~16 y empieza a reciclar los mas antiguos.

### 1.3 Por que los modelos grandes no cargan

Los modelos con texturas PBR de 4-16 MB necesitan GPU memory para decodificar y almacenar las texturas (normal, roughness, metalness, base color). Con N contextos independientes, la GPU reserva memoria N veces para el environment map y no puede compartir texturas entre contextos. Al llegar al limite de VRAM, el driver fuerza context loss.

---

## 2. Analisis del componente View de drei

### 2.1 Como funciona internamente

Lei el source de `@react-three/drei@10.7.7` (`node_modules/@react-three/drei/web/View.js`). El mecanismo es:

1. **Un solo `<Canvas>` global** contiene el unico WebGLRenderer.
2. `View` detecta si esta dentro o fuera de un Canvas:
   - **Fuera** (nuestro caso): renderiza un `<div>` HTML (tracking element) + usa `tunnel-rat` para portar el contenido 3D al Canvas global.
   - **Dentro**: renderiza directamente como `CanvasView`.
3. `<View.Port />` se coloca dentro del Canvas global y recibe todos los portales.
4. En cada frame, `Container` (componente interno) hace:
   - `getBoundingClientRect()` del div tracking para obtener posicion/tamano
   - `gl.setViewport(left, bottom, width, height)` — recorta el area de render
   - `gl.setScissor(left, bottom, width, height)` — activa scissor test
   - `gl.render(scene, camera)` — renderiza solo esa porcion
   - Restaura el estado del scissor

Esto significa: **un solo contexto WebGL, un solo renderer, multiples escenas renderizadas secuencialmente en regiones del canvas**.

### 2.2 Implicaciones clave

| Aspecto | Canvas individual (actual) | View compartido (propuesto) |
|---------|---------------------------|----------------------------|
| Contextos WebGL | N (13-14) | 1 |
| Environment maps | N copias | 1 compartido |
| GPU memory | N * (texturas + env) | 1 * env + texturas compartidas via cache |
| Draco decoder | N instancias | 1 instancia |
| OrbitControls | Funciona nativamente | Funciona por viewport (events.connected) |
| frameloop='demand' | Por Canvas | Global, pero `frames` prop controla por View |

### 2.3 OrbitControls por viewport

Si. `View` conecta los eventos del DOM al tracking element:

```javascript
// View.js linea 126-131
rootState.setEvents({ connected: track.current });
```

Cada `View` redirige los eventos de puntero a su propio tracking div. `OrbitControls` dentro de un `View` solo responde a eventos sobre ese div. Esto es equivalente al comportamiento actual donde cada Canvas tiene sus propios controles.

### 2.4 frameloop='demand' equivalente

`View` acepta un prop `frames` (por defecto `Infinity`). Para simular `frameloop='demand'`:
- `frames={1}` — renderiza solo 1 frame (equivalente a un snapshot estatico)
- `frames={Infinity}` — renderiza siempre (equivalente a `frameloop='always'`)

Para el hover behavior actual (`frameloop={hovered ? 'always' : 'demand'}`), se puede alternar el prop `frames` o usar `useFrame` con invalidacion manual.

---

## 3. Arquitectura propuesta

### 3.1 Diagrama de componentes

```
App.tsx (o layout root)
  └─ <Canvas> (UNICO — fullscreen, position:fixed, pointer-events:none)
       ├─ <View.Port />           ← recibe todos los portales de View
       └─ (configuracion global: toneMapping, outputColorSpace)

Gallery.tsx
  └─ filteredModels.map(model =>
       <ModelCard>
         <View className="card-viewer">    ← div HTML, tracking element
           <ModelScene url={...} />
         </View>
       </ModelCard>
     )

ModelModal.tsx
  └─ <View className="modal-viewer">      ← mismo Canvas global
       <ModelScene url={...} />
     </View>
```

### 3.2 Canvas global — donde colocarlo

El `<Canvas>` debe ser un overlay que cubra toda la ventana, por encima del contenido HTML en z-index pero con `pointer-events: none` para que los clicks pasen al HTML. Los tracking divs de `View` manejan sus propios eventos.

```tsx
// src/components/SceneCanvas.tsx (nuevo, unico archivo nuevo necesario)
import { Canvas } from '@react-three/fiber';
import { View } from '@react-three/drei';

export default function SceneCanvas() {
  return (
    <Canvas
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
      }}
      eventSource={document.getElementById('root')!}
      eventPrefix="client"
      camera={{ position: [0, 0, 5], fov: 40 }}
      gl={{ antialias: false, powerPreference: 'low-power' }}
      dpr={1}
    >
      <View.Port />
    </Canvas>
  );
}
```

`eventSource` y `eventPrefix="client"` son clave: le dicen a R3F que los eventos vienen del root HTML, no del canvas. Combinado con el `track` de cada `View`, los eventos se rutean correctamente a cada viewport.

### 3.3 Cambios en ModelCard.tsx

```tsx
// ANTES
import { Canvas } from '@react-three/fiber';
// ...
<div className="card-viewer" onClick={onClick}>
  {visible ? (
    <Canvas camera={...} gl={...} dpr={1} frameloop={hovered ? 'always' : 'demand'}>
      <ModelScene url={modelUrl} ... />
    </Canvas>
  ) : (
    <div>...</div>
  )}
</div>

// DESPUES
import { View } from '@react-three/drei';
// ...
<div className="card-viewer" onClick={onClick}>
  {visible ? (
    <View style={{ width: '100%', height: '100%' }}>
      <ModelScene url={modelUrl} autoRotate={hovered} ... />
    </View>
  ) : (
    <div>...</div>
  )}
</div>
```

El IntersectionObserver para `visible` sigue funcionando igual — cuando `visible=false`, el `View` no se monta y no consume frames.

### 3.4 Cambios en ModelModal.tsx

```tsx
// ANTES
<Canvas camera={{ position: [3, 2, 3], fov: 40 }} gl={{ antialias: true }}>
  <ModelScene ... />
</Canvas>

// DESPUES
<View style={{ width: '100%', height: '100%' }} index={100}>
  <ModelScene ... />
</View>
```

`index={100}` da prioridad de render alta al modal (se renderiza despues = encima en caso de overlap visual).

**Nota sobre antialias**: El Canvas global se configura una vez. Si el modal necesita antialias y las cards no, hay dos opciones:
1. Activar antialias globalmente (costo en todas las views)
2. Dejar antialias off globalmente (las cards ya lo tienen off, el modal pierde calidad)

Recomendacion: dejar `antialias: false` global. El beneficio de un solo contexto supera la perdida de AA en el modal. Si es critico, se puede aplicar FXAA como post-effect solo en la escena del modal.

### 3.5 Cambios en ModelScene.tsx

**Ninguno.** ModelScene no sabe que esta dentro de un Canvas o un View. Sus hijos (Environment, lights, OrbitControls, Model3D) funcionan identicamente dentro de un portal de View.

### 3.6 Cambios en Model3D.tsx

**Ninguno.** `useGLTF` cachea por URL automaticamente. Con un solo Canvas, el cache de three.js es compartido — si dos cards usan el mismo modelo, se carga una sola vez. Esto no cambia con View.

### 3.7 Cambios en Gallery.tsx

Minimos. Solo importar el SceneCanvas y montarlo una vez:

```tsx
// En el return de Gallery (o mejor, en App.tsx / layout):
<>
  <SceneCanvas />
  {/* ... resto del JSX actual sin cambios ... */}
</>
```

### 3.8 SortableModelCard.tsx

**Sin cambios.** Es un wrapper de DnD que delega a ModelCard. La transformacion CSS (translate) del drag mueve el div tracking, y View recalcula su posicion via `getBoundingClientRect()` en cada frame.

---

## 4. Riesgos y mitigaciones

### 4.1 Scroll performance

`View` llama `getBoundingClientRect()` en cada frame para cada viewport visible. Con 13 views esto son 13 layout queries por frame. En la practica esto no es un problema porque:
- `getBoundingClientRect()` es muy rapido en Chrome (~0.01ms)
- El IntersectionObserver ya limita las views montadas a las visibles

### 4.2 Z-ordering del Canvas overlay

El Canvas fixed debe estar por debajo de los modales HTML (AuthModal, UploadForm, etc.) pero los Views del modal 3D deben renderizar correctamente. Solucion: el modal 3D usa View (que renderiza dentro del Canvas), pero el overlay/backdrop del modal es HTML puro con `z-index` mayor que el Canvas.

```css
/* Canvas global */
.scene-canvas { position: fixed; z-index: 1; pointer-events: none; }

/* Modales HTML */
.modal-overlay { z-index: 1000; }
```

El View dentro del modal renderiza en el Canvas (z-index: 1), pero el usuario ve el resultado "a traves" del div tracking que esta dentro del modal (z-index: 1000). Visualmente funciona porque el Canvas es transparent donde no hay Views renderizando (scissor test limpia cada region).

### 4.3 Disposal de recursos

Con Canvas individuales, al desmontar un ModelCard se destruye su Canvas y se liberan texturas. Con View, el desmontaje del View limpia su escena virtual pero las texturas cargadas por `useGLTF` permanecen en el cache global de three.js.

Mitigacion: `useGLTF` ya tiene un sistema de cache. Si se necesita liberar memoria agresivamente, se puede llamar `useGLTF.clear()` o implementar un LRU cache manual. Para 13 modelos esto no es urgente.

### 4.4 Hot reload en desarrollo

El Canvas global persiste entre hot reloads de componentes hijos. Esto es una mejora sobre el estado actual donde cada hot reload de ModelCard destruye y recrea su Canvas.

---

## 5. Plan de migracion por fases

### Fase 1: Canvas global + View en cards (scope minimo)
1. Crear `SceneCanvas.tsx` con Canvas + View.Port
2. Montar SceneCanvas en App.tsx o layout
3. Reemplazar `<Canvas>` por `<View>` en ModelCard.tsx
4. Verificar que OrbitControls y hover behavior funcionan
5. **Resultado**: de 13+ contextos a 1

### Fase 2: Modal integrado
6. Reemplazar `<Canvas>` por `<View>` en ModelModal.tsx
7. Ajustar z-index y verificar que el modal renderiza sobre las cards
8. **Resultado**: 0 contextos adicionales al abrir modal

### Fase 3: Optimizaciones (opcional, post-validacion)
9. Implementar `frames` prop para pausar Views no visibles
10. Evaluar FXAA selectivo para el modal si se necesita AA
11. Considerar progressive loading de texturas

---

## 6. Metricas de exito

| Metrica | Antes | Despues esperado |
|---------|-------|-----------------|
| Contextos WebGL | 13-14 | 1 |
| `Context Lost` errors | 30+ | 0 |
| Environment maps en memoria | 13 | 1 |
| Modelos PBR grandes cargan | No (VRAM agotada) | Si |
| GPU memory estimada | ~13x base | ~1x base + texturas |

---

## 7. Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/SceneCanvas.tsx` | **NUEVO** — Canvas global + View.Port |
| `src/components/ModelCard.tsx` | `Canvas` → `View` |
| `src/components/ModelModal.tsx` | `Canvas` → `View` |
| `src/App.tsx` (o layout) | Montar `<SceneCanvas />` |
| `src/components/ModelScene.tsx` | Sin cambios |
| `src/components/Model3D.tsx` | Sin cambios |
| `src/components/Gallery.tsx` | Sin cambios |
| `src/components/SortableModelCard.tsx` | Sin cambios |
