---
autor: Felipe Vargas Montoya
cargo: Especialista Browser & JavaScript
fecha: 2026-04-10
tema: Diagnóstico WebGL Context Lost — estrategia de Canvas compartido
estado: revision
---

# Diagnóstico: WebGL Context Lost en Galería 3D (React Three Fiber)

## 1. Problema

La galería crea un `<Canvas>` independiente por cada `ModelCard` (13 tarjetas). Cada Canvas instancia su propio `THREE.WebGLRenderer`, que requiere un contexto WebGL dedicado. Chrome limita a **16 contextos WebGL activos por pestaña**. Con 13 tarjetas visibles mas el modal (que abre otro Canvas), se roza o supera el limite, provocando `THREE.WebGLRenderer: Context Lost` en cascada.

### Por que falla aun con IntersectionObserver

El IntersectionObserver actual usa `rootMargin: '200px'`, lo que pre-monta tarjetas fuera del viewport. Con un grid de 3-4 columnas y scroll, facilmente 10-13 Canvas quedan montados simultaneamente. Cuando el usuario abre el modal (Canvas adicional), se llega a 14+ contextos activos. Los modelos con texturas PBR embebidas (4-16 MB) agravan el problema porque la GPU agota VRAM antes de alcanzar el limite numerico de contextos.

### Cadena de fallo

```
13 ModelCard visibles → 13 Canvas → 13 WebGLRenderer → 13 contextos WebGL
+ 1 Modal Canvas = 14 contextos
+ Chrome destruye contextos antiguos → "Context Lost" en cascada
+ Modelos PBR 4-16MB → GPU memory pressure → mas context loss
```

## 2. Causa raiz

No es solo el limite numerico de contextos. Son tres factores combinados:

1. **Limite de contextos**: Chrome = 16, Safari iOS = 4-8. Con 13 Cards + modal se supera en Chrome y se desborda completamente en Safari.
2. **GPU memory**: Cada Canvas aloca buffers de color + depth + stencil independientes. Con 13 Canvas a ~300x300px, son ~13 render targets. Las texturas PBR (diffuse + normal + roughness + metalness + AO) de 2048x2048 suman ~80MB de VRAM por modelo. 13 modelos = ~1GB de VRAM solo en texturas.
3. **Draco decompression**: Cada Canvas ejecuta el decoder Draco (via WASM worker) de forma independiente. 13 decompresiones concurrentes saturan la thread pool del browser.

## 3. Evaluacion de estrategias

### A. Single shared Canvas con `View` de @react-three/drei

**Concepto**: Un unico `<Canvas>` a nivel de `Gallery`. Cada `ModelCard` usa `<View>` (de drei v10, que ya tenemos) para definir una "ventana" dentro de ese Canvas. Internamente, `View` usa `gl.setViewport()` + `gl.setScissor()` para renderizar cada modelo en su region del Canvas, sin crear contextos adicionales.

**Ventajas**:
- **1 solo contexto WebGL** para toda la galeria
- Las texturas cargadas por useGLTF se comparten en el mismo renderer (cache de Three.js)
- Draco decoder se inicializa una sola vez
- Compatible con el IntersectionObserver existente (View puede ocultarse)

**Desventajas**:
- View requiere que el Canvas sea `position: fixed` y cubra toda la pantalla (funciona como un overlay invisible)
- Requiere reestructurar Gallery y ModelCard
- El modal necesita tratamiento especial (puede usar el mismo Canvas o uno dedicado)

**Veredicto**: **RECOMENDADA**. Es la solucion oficial del ecosistema R3F para exactamente este problema. drei v10 (que ya usamos) incluye `View`.

### B. Virtualizacion: solo 4-6 Canvas visibles

**Concepto**: Destruir Canvas de tarjetas fuera del viewport con margen cero. Solo las tarjetas 100% visibles mantienen Canvas.

**Ventajas**:
- Cambio minimo en la arquitectura
- Reduce contextos activos a 4-6

**Desventajas**:
- Cada scroll destruye/recrea Canvas → lag visible
- Las texturas PBR se descargan y recargan al scrollear → parpadeo
- No resuelve el problema de GPU memory (6 modelos PBR aun suman ~480MB VRAM)
- useGLTF cache se invalida al destruir el Canvas porque el renderer cambia

**Veredicto**: Paliativo, no solucion. Cambia el problema de "demasiados contextos" por "demasiado churn".

### C. Thumbnails estaticos: renderizar una vez, capturar como imagen

**Concepto**: Montar Canvas, renderizar 1 frame, `canvas.toDataURL()`, destruir Canvas, mostrar `<img>`.

**Ventajas**:
- 0 contextos WebGL permanentes en la galeria
- Rendimiento de scroll optimo

**Desventajas**:
- Pierde la rotacion en hover (feature actual)
- Renderizar 13 modelos PBR secuencialmente toma 10-30 segundos
- Necesita un pipeline de pre-render (backend o build-time), no viable en client-side con modelos de 16MB
- Complejidad alta para beneficio limitado si la solucion A existe

**Veredicto**: Buena optimizacion complementaria para generar posters, pero no reemplaza el render interactivo.

### D. OffscreenCanvas / Web Workers

**Concepto**: Mover el render de Three.js a un Web Worker con OffscreenCanvas.

**Ventajas**:
- Libera el main thread
- Cada worker tiene su contexto aislado

**Desventajas**:
- OffscreenCanvas **comparte el mismo limite de contextos WebGL** del proceso GPU. No reduce el numero de contextos.
- React Three Fiber no soporta OffscreenCanvas de forma nativa
- drei hooks (useGLTF, OrbitControls, etc.) asumen acceso al DOM → no funcionan en workers
- Complejidad extrema para cero beneficio en el problema de contextos

**Veredicto**: **No aplicable**. No resuelve el problema.

## 4. Solucion recomendada: Shared Canvas + View

### Arquitectura propuesta

```
Gallery.tsx
├── <div className="gallery-grid">
│   ├── <ModelCard ref={cardRef1}> ← div puro, sin Canvas
│   ├── <ModelCard ref={cardRef2}>
│   └── ...
└── <Canvas> ← UN SOLO Canvas, fixed, cubre toda la pagina
    ├── <View track={cardRef1}> <ModelScene url="..." /> </View>
    ├── <View track={cardRef2}> <ModelScene url="..." /> </View>
    └── ...
```

### Ejemplo de implementacion

**ModelCard.tsx** (simplificado, sin Canvas propio):

```tsx
import { forwardRef, useState, useRef, useEffect } from 'react';

interface ModelCardProps {
  title: string;
  student: string;
  category: string;
  // ... resto de props existentes, SIN modelUrl
  onClick: () => void;
}

// forwardRef para que Gallery pueda pasar el ref al View.track
const ModelCard = forwardRef<HTMLDivElement, ModelCardProps>(
  ({ title, student, category, tags, canEdit, likeCount, commentCount,
     isLiked, onLike, onClick, onEdit, onDelete }, ref) => {

    const [hovered, setHovered] = useState(false);

    return (
      <div className="card" onMouseEnter={() => setHovered(true)}
           onMouseLeave={() => setHovered(false)}>
        {/* Este div es el "tracking target" del View */}
        <div ref={ref} className="card-viewer" onClick={onClick}>
          {/* NO hay Canvas aqui — View renderiza en este rect */}
        </div>
        <div className="card-info" onClick={onClick}>
          {/* ... info existente sin cambios ... */}
        </div>
      </div>
    );
  }
);
```

**Gallery.tsx** (Canvas compartido):

```tsx
import { useRef, createRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { View } from '@react-three/drei';
import ModelCard from './ModelCard';
import ModelScene from './ModelScene';

export default function Gallery() {
  const [models, setModels] = useState<ModelRow[]>([]);
  // Refs para tracking de cada card
  const cardRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());

  const getCardRef = (id: string) => {
    if (!cardRefs.current.has(id)) {
      cardRefs.current.set(id, createRef<HTMLDivElement>());
    }
    return cardRefs.current.get(id)!;
  };

  return (
    <>
      <div className="gallery-grid">
        {filteredModels.map((model) => (
          <ModelCard
            key={model.id}
            ref={getCardRef(model.id)}
            title={model.title}
            student={model.student}
            /* ... resto de props ... */
          />
        ))}
      </div>

      {/* UN SOLO Canvas para toda la galeria */}
      <Canvas
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100vw', height: '100vh',
          pointerEvents: 'none', // Los clicks pasan al DOM normal
        }}
        eventSource={document.body}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        dpr={1}
        frameloop="demand"
      >
        {filteredModels.map((model) => (
          <View key={model.id} track={getCardRef(model.id)}>
            <ModelScene
              url={model.file_url}
              autoRotate={false}
              enableZoom={false}
              enablePan={false}
              enableRotate={false}
            />
          </View>
        ))}
      </Canvas>
    </>
  );
}
```

### Consideraciones de implementacion

1. **`pointerEvents: 'none'`** en el Canvas fixed: los eventos de click, hover, etc. pasan al DOM normal debajo. Los botones de like, edit, delete siguen funcionando sin cambios.

2. **Hover/autoRotate**: Para detectar hover en cada card y activar autoRotate, cada ModelCard puede comunicar su estado de hover via callback o context. ModelScene ya acepta `autoRotate` como prop.

3. **Modal**: El ModelModal puede seguir usando su propio Canvas dedicado (es uno solo, no causa problemas) o integrarse como otro View dentro del Canvas compartido.

4. **IntersectionObserver**: `View` de drei internamente usa IntersectionObserver para no renderizar regiones fuera del viewport. No necesitamos nuestro observer custom.

5. **SortableModelCard / DnD**: forwardRef es compatible con @dnd-kit. El ref del card-viewer se pasa al View.track mientras el ref del contenedor va a useSortable.

6. **Draco decoder**: Se inicializa una sola vez porque hay un solo renderer. `useGLTF.setDecoderPath()` sigue funcionando igual.

7. **Texture cache**: Con un solo renderer, `useGLTF` reutiliza texturas ya decodificadas. Si dos modelos comparten la misma textura, solo se carga una vez en VRAM.

## 5. Metricas esperadas

| Metrica | Antes (13 Canvas) | Despues (1 Canvas + View) |
|---------|-------------------|---------------------------|
| Contextos WebGL | 13-14 | 1 |
| Instancias WebGLRenderer | 13-14 | 1 |
| Draco WASM instances | 13 | 1 |
| VRAM overhead (render targets) | ~13x buffers | 1 buffer (viewport/scissor) |
| Texture cache | Fragmentado por renderer | Unificado, con deduplicacion |
| Context Lost events | 30+ | 0 (esperado) |
| Safari iOS compatible | No (limite 4) | Si (1 contexto) |

## 6. Plan de implementacion

```
Sprint 1 (1 dia):
  - [ ] Refactorizar ModelCard: extraer Canvas, usar forwardRef
  - [ ] Agregar Canvas compartido en Gallery con View por modelo
  - [ ] Verificar que el grid visual no cambie

Sprint 2 (1 dia):
  - [ ] Integrar hover → autoRotate via estado compartido
  - [ ] Verificar que DnD (reorder mode) funcione con forwardRef
  - [ ] Probar modal (Canvas propio vs View adicional)

Sprint 3 (medio dia):
  - [ ] Testing en Chrome, Firefox, Safari
  - [ ] Verificar 0 context lost en DevTools (chrome://gpu)
  - [ ] Build de produccion y deploy
```

## 7. Riesgos

1. **View + OrbitControls por modelo**: Cada View con OrbitControls independientes puede generar conflictos de eventos. En las cards no hay controles (todo disabled), asi que no aplica. En el modal si hay controles, pero es un solo View activo.

2. **Performance con 13 Views**: Un solo Canvas renderizando 13 viewports por frame es mas eficiente que 13 Canvas separados, pero si todos los modelos estan en pantalla, el draw call count es el mismo. La ganancia es en overhead de contextos, no en geometria.

3. **Z-index del Canvas fixed**: El Canvas fixed necesita `z-index` alto pero `pointerEvents: none`. Si algun modal o overlay tiene z-index conflictivo, el Canvas puede renderizar encima o debajo incorrectamente. Solucion: manejar visibility del Canvas cuando hay modales abiertos.
