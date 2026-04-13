---
autor: Sebastian Torres Mejia
cargo: Senior Dev Astro/React
fecha: 2026-04-13
tema: Plan de implementacion - Thumbnails estaticos
estado: revision
---

# Plan de implementacion: Thumbnails estaticos para ModelCard

## 1. Contexto y decision

La galeria actualmente crea un `<Canvas>` WebGL por cada `ModelCard` (13 modelos). Chrome limita a ~16 contextos WebGL, provocando `Context Lost` en cascada. Felipe Vargas documento este problema el 2026-04-10.

**Decision del equipo**: Migrar las tarjetas a thumbnails estaticos (imagenes PNG). El Canvas WebGL solo existira en el `ModelModal` (al hacer click para ver en detalle).

**Alternativa descartada**: Shared Canvas con `View` de drei. Aunque es la solucion "oficial" de R3F, requiere reestructurar Gallery completo, tiene complejidad con DnD/reorder, y el Canvas fixed con z-index genera conflictos con modales. Los thumbnails son mas simples, mas performantes y eliminan 100% de los contextos WebGL de la grilla.

## 2. Arquitectura actual (que cambia)

### UploadForm.tsx (lineas 148-157)
- Monta un `<Canvas>` con `<ModelScene>` para preview del GLB antes de subir
- El submit sube el GLB a Supabase Storage y guarda metadata en tabla `models`
- **No captura thumbnail** — solo sube el archivo GLB

### ModelCard.tsx (lineas 81-96)
- Cada tarjeta monta su propio `<Canvas>` con `<ModelScene>`
- Usa `IntersectionObserver` con `rootMargin: '200px'` para lazy-mount
- `frameloop` cambia a `'always'` en hover (autoRotate), `'demand'` en reposo
- **Es la causa del Context Lost** — 13 Canvas simultaneos

### ModelModal.tsx (linea 113)
- Un solo `<Canvas>` con controles completos (zoom, pan, rotate)
- **Se mantiene sin cambios** — solo 1 Canvas activo, no hay problema

### Model3D.tsx
- Carga GLB con `useGLTF`, normaliza escala, centra modelo, corrige color space
- **Se mantiene sin cambios** — se reutiliza en el Canvas del modal

### ModelScene.tsx
- Escena studio reutilizable: Environment, ContactShadows, OrbitControls, luces
- **Se mantiene sin cambios**

### Tabla `models` en Supabase
```
id, title, student, category, description, tags,
file_name, file_url, file_size, user_id,
created_at, updated_at, sort_order
```
**No tiene columna `thumbnail_url`** — hay que agregarla.

## 3. Plan de implementacion

### Fase A: Captura de thumbnail en UploadForm

#### Momento de captura

El thumbnail se captura **despues de que el modelo termina de cargar** en el preview Canvas del UploadForm. El flujo:

1. Usuario selecciona archivo GLB
2. Se crea `objectURL` y se monta el Canvas de preview (ya existe, linea 148)
3. `useGLTF` carga el modelo + Draco decompression
4. **Nuevo**: Se detecta que el modelo cargo via un callback `onLoaded`
5. **Nuevo**: Se espera 1 frame adicional (para que ContactShadows se estabilice)
6. **Nuevo**: Se captura el Canvas como PNG blob
7. El blob se guarda en state, listo para subir junto con el GLB en `handleSubmit`

#### Deteccion de carga completada

R3F no tiene un evento nativo "scene rendered". La estrategia es usar un componente wrapper dentro del Canvas que detecta cuando `useGLTF` resolvio y luego espera 2 frames con `useFrame`:

```tsx
// ThumbnailCapture.tsx — componente hijo del Canvas de preview
import { useThree, useFrame } from '@react-three/fiber';
import { useRef, useEffect } from 'react';

interface ThumbnailCaptureProps {
  modelLoaded: boolean;
  onCapture: (blob: Blob) => void;
}

export default function ThumbnailCapture({ modelLoaded, onCapture }: ThumbnailCaptureProps) {
  const { gl } = useThree();
  const frameCount = useRef(0);
  const captured = useRef(false);

  useFrame(() => {
    if (!modelLoaded || captured.current) return;

    frameCount.current++;

    // Esperar 3 frames: 1 para geometria, 1 para shadows, 1 de margen
    if (frameCount.current >= 3) {
      captured.current = true;

      // gl.domElement es el <canvas> del WebGLRenderer
      gl.domElement.toBlob((blob) => {
        if (blob) onCapture(blob);
      }, 'image/png');
    }
  });

  return null;
}
```

#### Comunicar "modelo cargado" desde Model3D al Canvas padre

Opcion mas limpia: agregar prop `onLoaded` a `Model3D`:

```tsx
// Model3D.tsx — agregar callback
export default function Model3D({ url, onLoaded }: Model3DProps & { onLoaded?: () => void }) {
  const { scene } = useGLTF(url);

  const model = useMemo(() => {
    // ... logica existente de clone, scale, center ...
    return cloned;
  }, [scene]);

  useEffect(() => {
    if (model && onLoaded) onLoaded();
  }, [model, onLoaded]);

  return <primitive object={model} />;
}
```

Y en `ModelScene`, propagar el callback:

```tsx
// ModelScene.tsx — agregar prop onModelLoaded
export default function ModelScene({
  url, autoRotate, enableZoom, enablePan, enableRotate, showFloor,
  onModelLoaded, // NUEVO
}: ModelSceneProps & { onModelLoaded?: () => void }) {
  return (
    <>
      {/* ... luces, environment ... */}
      <Suspense fallback={<Html center>...</Html>}>
        <Model3D url={url} onLoaded={onModelLoaded} />
      </Suspense>
      {/* ... floor, controls ... */}
    </>
  );
}
```

#### Subida del thumbnail en handleSubmit

El thumbnail se sube al **mismo bucket `models`** de Supabase Storage, con prefijo `thumbnails/`:

```tsx
// Dentro de handleSubmit en UploadForm.tsx

// 1. Upload GLB (existente)
const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
await supabase.storage.from('models').upload(fileName, file, { ... });

// 2. Upload thumbnail (NUEVO)
let thumbnailUrl: string | null = null;
if (thumbnailBlob) {
  setProgress('Generando thumbnail...');
  const thumbName = `thumbnails/${Date.now()}-thumb.png`;
  const { error: thumbError } = await supabase.storage
    .from('models')
    .upload(thumbName, thumbnailBlob, {
      contentType: 'image/png',
      upsert: false,
    });

  if (!thumbError) {
    const { data: thumbUrlData } = supabase.storage
      .from('models')
      .getPublicUrl(thumbName);
    thumbnailUrl = thumbUrlData.publicUrl;
  }
}

// 3. Insert metadata (modificado — agregar thumbnail_url)
await supabase.from('models').insert({
  title, student, category, description,
  tags, file_name: fileName, file_url: fileUrl, file_size: file.size,
  user_id: session?.user?.id || null,
  thumbnail_url: thumbnailUrl, // NUEVO
});
```

#### Tamano del thumbnail

El Canvas de preview en UploadForm ocupa aprox. 300x200px. `toBlob()` captura a esa resolucion nativa. Para thumbnails mas nitidos en pantallas retina, se puede forzar `dpr={2}` en el Canvas de preview, lo que genera una imagen de ~600x400px (suficiente para tarjetas).

Peso estimado: 30-80KB por PNG (escena 3D con fondo oscuro comprime bien).

### Fase B: ModelCard sin Canvas

Reemplazar el Canvas completo por un `<img>` con el thumbnail:

```tsx
// ModelCard.tsx — simplificado, SIN Canvas ni R3F imports
export default function ModelCard({
  title, student, category, tags,
  thumbnailUrl, // NUEVO — reemplaza modelUrl
  canEdit, likeCount, commentCount, isLiked,
  onLike, onClick, onEdit, onDelete,
}: ModelCardProps) {

  return (
    <div className="card">
      <div className="card-viewer" onClick={onClick}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Preview de ${title}`}
            className="card-thumbnail"
            loading="lazy"
          />
        ) : (
          <div className="card-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                 stroke="#555" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            <span>Sin preview</span>
          </div>
        )}
        <div className="card-overlay-hover">
          <button className="view-btn">Ver en detalle</button>
        </div>
      </div>
      <div className="card-info" onClick={onClick}>
        {/* ... resto sin cambios ... */}
      </div>
    </div>
  );
}
```

#### CSS para el thumbnail

```css
.card-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
}

.card:hover .card-thumbnail {
  transform: scale(1.05);
}

.card-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #1a1a1a;
  color: #555;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
}
```

#### Eliminaciones

Al quitar Canvas de ModelCard, se eliminan estos imports y logica:

- `import { Canvas } from '@react-three/fiber'` en ModelCard.tsx
- `import ModelScene from './ModelScene'` en ModelCard.tsx
- Estado `hovered` para `frameloop` toggle (ya no necesario; hover CSS basta)
- Estado `visible` + `IntersectionObserver` (el browser maneja lazy loading de `<img>` nativo)
- La prop `modelUrl` en ModelCardProps se reemplaza por `thumbnailUrl`

Lo mismo aplica a `SortableModelCard` (que es un wrapper de `ModelCard`).

### Fase C: Modelos existentes sin thumbnail

Los 13 modelos actuales no tienen `thumbnail_url` en la tabla. Hay tres opciones:

#### Opcion 1: Fallback visual (placeholder) — RECOMENDADA para dia 1

Los modelos sin thumbnail muestran un placeholder SVG generico (el cubo 3D del snippet arriba). Simple, sin deuda tecnica.

#### Opcion 2: Script de migracion batch (recomendada para dia 2-3)

Un script Node.js que:
1. Consulta todos los modelos sin `thumbnail_url`
2. Para cada uno, carga el GLB en un Canvas headless (usando Three.js directamente, sin React)
3. Renderiza 1 frame con la misma escena studio
4. Captura como PNG, sube a Supabase Storage
5. Actualiza `thumbnail_url` en la tabla

```ts
// scripts/generate-thumbnails.ts (concepto)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { createClient } from '@supabase/supabase-js';

const WIDTH = 600;
const HEIGHT = 400;

async function renderThumbnail(glbUrl: string): Promise<Buffer> {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(WIDTH, HEIGHT);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a1a1a');

  const camera = new THREE.PerspectiveCamera(40, WIDTH / HEIGHT, 0.1, 100);
  camera.position.set(3, 2, 3);
  camera.lookAt(0, 0, 0);

  // Luces studio (mismas que ModelScene)
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.35);
  dirLight.position.set(5, 8, 3);
  scene.add(dirLight);

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(glbUrl);
  // ... normalize scale + center (misma logica de Model3D.tsx) ...
  scene.add(gltf.scene);

  renderer.render(scene, camera);

  // Extraer pixels como PNG buffer
  const canvas = renderer.domElement;
  // En Node con headless-gl o puppeteer, usar canvas.toBuffer('image/png')

  renderer.dispose();
  return buffer;
}
```

**Nota**: Este script requiere un entorno con WebGL (puppeteer/headless Chrome, o `headless-gl` para Node). La opcion mas practica es un script de Puppeteer que:
1. Abre una pagina con un Canvas temporal
2. Carga cada GLB
3. Captura screenshot
4. Sube a Supabase

#### Opcion 3: Render on-demand en el browser (descartada)

Montar un Canvas oculto que renderiza cada modelo secuencialmente, captura, y destruye. Problema: 13 modelos PBR de 4-16MB renderizados secuencialmente toma 15-30 segundos en el browser del usuario. La experiencia es mala. Descartado.

### Recomendacion: Opcion 1 + Opcion 2 en paralelo

- Dia 1: Deploy con placeholder para modelos sin thumbnail
- Dia 2: Ejecutar script de migracion una vez para generar los 13 thumbnails
- A partir de entonces: todo modelo nuevo se sube con thumbnail automatico

## 4. Cambios en base de datos

### Columna nueva en tabla `models`

```sql
ALTER TABLE models ADD COLUMN thumbnail_url text;
```

No necesita NOT NULL porque los modelos existentes no tendran valor inicialmente.

### Actualizar ModelRow en supabase.ts

```ts
export interface ModelRow {
  id: string;
  title: string;
  // ... campos existentes ...
  thumbnail_url: string | null; // NUEVO
}
```

### RLS

La columna `thumbnail_url` hereda las politicas RLS existentes de la tabla `models`. No se necesitan politicas adicionales.

### Storage

Los thumbnails van en `models` bucket, carpeta `thumbnails/`. La politica publica existente del bucket cubre esta ruta (es un bucket publico).

## 5. Archivos a modificar

| Archivo | Cambio | Complejidad |
|---------|--------|-------------|
| `src/components/UploadForm.tsx` | Agregar captura thumbnail + subida | Alta |
| `src/components/ModelCard.tsx` | Quitar Canvas, usar `<img>` | Media |
| `src/components/SortableModelCard.tsx` | Propagar `thumbnailUrl` en vez de `modelUrl` | Baja |
| `src/components/Gallery.tsx` | Pasar `thumbnailUrl` a ModelCard | Baja |
| `src/components/Model3D.tsx` | Agregar prop `onLoaded` | Baja |
| `src/components/ModelScene.tsx` | Propagar `onModelLoaded` | Baja |
| `src/lib/supabase.ts` | Agregar `thumbnail_url` a `ModelRow` | Baja |
| `src/styles/gallery.css` | Agregar `.card-thumbnail`, `.card-placeholder` | Baja |
| Supabase Dashboard | `ALTER TABLE models ADD COLUMN thumbnail_url text` | Baja |

**Archivos que NO cambian**: `ModelModal.tsx` (conserva su Canvas propio para vista interactiva).

## 6. Orden de implementacion (sprints Scrumban)

### Sprint 1: Infraestructura (0.5 dia)

- [ ] ALTER TABLE en Supabase: agregar `thumbnail_url`
- [ ] Actualizar `ModelRow` en `supabase.ts`
- [ ] Agregar `onLoaded` a Model3D y `onModelLoaded` a ModelScene

### Sprint 2: Captura en UploadForm (1 dia)

- [ ] Crear componente `ThumbnailCapture` (hijo del Canvas)
- [ ] Integrar en UploadForm: state `thumbnailBlob`, callback `onCapture`
- [ ] Subir thumbnail en `handleSubmit` antes del insert
- [ ] Guardar `thumbnail_url` en el insert de metadata
- [ ] Verificar flujo completo: subir modelo → thumbnail aparece en Storage

### Sprint 3: ModelCard estatico (0.5 dia)

- [ ] Reemplazar Canvas por `<img>` en ModelCard
- [ ] Actualizar SortableModelCard
- [ ] Actualizar Gallery para pasar `thumbnailUrl`
- [ ] CSS para `.card-thumbnail` y `.card-placeholder`
- [ ] Verificar que hover overlay sigue funcionando

### Sprint 4: Migracion modelos existentes (0.5 dia)

- [ ] Script Puppeteer para generar thumbnails batch
- [ ] Ejecutar migracion en los 13 modelos existentes
- [ ] Verificar que todos los thumbnails se ven correctamente

## 7. Metricas esperadas

| Metrica | Antes | Despues |
|---------|-------|---------|
| Contextos WebGL (grilla) | 13 | 0 |
| Contextos WebGL (modal) | 1 | 1 (sin cambio) |
| Context Lost events | frecuentes | 0 |
| Peso de pagina inicial | 13 GLB (50-200MB total) | 13 PNG (~1MB total) |
| Time to interactive | 5-15s (carga GLBs) | <2s (carga PNGs lazy) |
| Safari iOS compatible | No | Si |
| VRAM en grilla | ~1GB (texturas PBR) | ~0 (imagenes 2D) |

## 8. Riesgos y mitigaciones

1. **`toBlob()` puede fallar en contextos cross-origin**: Los GLBs vienen de Supabase Storage (mismo dominio CORS). En UploadForm el preview usa `URL.createObjectURL(file)` (local), asi que no hay problema de tainted canvas.

2. **El thumbnail puede capturarse antes de que las sombras se estabilicen**: Se mitiga esperando 3 frames en `ThumbnailCapture`. Si no es suficiente, subir a 5-10 frames (delay imperceptible para el usuario).

3. **El Canvas de preview en UploadForm preserveDrawingBuffer**: Por defecto `<Canvas>` de R3F tiene `preserveDrawingBuffer: false`. Para que `toBlob()` funcione, hay que agregar `gl={{ preserveDrawingBuffer: true }}` al Canvas de preview. Sin esto, `toBlob()` retorna una imagen negra.

4. **Modelos existentes sin thumbnail**: El placeholder es aceptable como estado temporal. No bloquea el deploy.

5. **EditModelForm**: Si el admin edita un modelo y cambia el GLB, deberia regenerarse el thumbnail. Hay que verificar si EditModelForm tiene preview Canvas (y agregar captura ahi tambien).
