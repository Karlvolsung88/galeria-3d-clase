---
autor: Natalia Vargas Ospina
cargo: Arquitecta Web
fecha: 2026-04-13
tema: Arquitectura de thumbnails estáticos para galería
estado: revision
---

# Arquitectura de Thumbnails Estáticos para Galería 3D

## 1. Problema actual

Cada `ModelCard` monta un `<Canvas>` de React Three Fiber con su propio contexto WebGL. Con 13 modelos visibles simultáneamente, Chrome alcanza el límite de ~16 contextos WebGL y dispara `WebGL Context Lost`. Además, cada tarjeta descarga el GLB completo solo para mostrar una vista previa estática — un desperdicio de ancho de banda y GPU.

## 2. Solución propuesta: Thumbnails estáticos estilo Sketchfab

Reemplazar el Canvas WebGL en las tarjetas de la galería por una imagen estática (thumbnail). El Canvas completo solo se activa al abrir el `ModelModal` para ver el modelo en detalle.

---

## 3. Análisis del schema actual

### Tabla `models` (interfaz `ModelRow` en `src/lib/supabase.ts`)

```typescript
interface ModelRow {
  id: string;
  title: string;
  student: string;
  category: string;
  description: string;
  tags: string[];
  file_name: string;    // nombre en Storage bucket 'models'
  file_url: string;     // URL pública del GLB
  file_size: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  sort_order?: number;
}
```

### Storage bucket actual

- Bucket: `models` (público)
- Contenido: archivos `.glb` con nombre `{timestamp}-{nombre}.glb`
- URL pública: `https://lvvleptxcddwhgmvxjdq.supabase.co/storage/v1/object/public/models/{file_name}`

---

## 4. Decisiones de arquitectura

### 4.1 Nueva columna: `thumbnail_url`

**Recomendación: SI, agregar columna `thumbnail_url TEXT NULL` a la tabla `models`.**

Justificación:
- Permite que modelos existentes (sin thumbnail) sigan funcionando con fallback
- Evita derivar la URL por convención (frágil si cambian nombres o bucket)
- Permite regenerar thumbnails independientemente sin romper la referencia al GLB
- Es consistente con el patrón actual donde `file_url` se guarda explícitamente

```sql
ALTER TABLE models ADD COLUMN thumbnail_url TEXT NULL;
```

Actualizar `ModelRow`:
```typescript
interface ModelRow {
  // ... campos existentes ...
  thumbnail_url: string | null;  // NUEVO
}
```

### 4.2 Storage: mismo bucket `models` con prefijo

**Recomendación: usar el MISMO bucket `models` con prefijo `thumbnails/`.**

Razones:
- No requiere crear un bucket nuevo ni configurar políticas RLS adicionales
- Las políticas de acceso público ya están configuradas
- Organización clara por prefijo: `thumbnails/{timestamp}-{nombre}.webp`
- Un solo dominio de Storage = menos configuración CORS

Estructura resultante del bucket:
```
models/
├── 1712345678-espada-vikinga.glb
├── 1712345679-dragon.glb
├── thumbnails/
│   ├── 1712345678-espada-vikinga.webp
│   └── 1712345679-dragon.webp
```

### 4.3 Formato y dimensiones del thumbnail

**Recomendación: WebP, 512x512px, calidad 80%.**

| Criterio | JPG | WebP | PNG |
|----------|-----|------|-----|
| Tamaño archivo (512px) | ~40-60 KB | ~20-35 KB | ~150-300 KB |
| Transparencia | No | Si | Si |
| Soporte navegadores | 100% | 97%+ | 100% |
| Calidad/peso | Bueno | Excelente | Excesivo |

- **512x512px**: suficiente para tarjetas de galería (las cards son ~300px de ancho, cubre 2x para retina)
- **WebP**: ~50% más liviano que JPG a calidad equivalente
- **Fondo opaco (#1a1a1a)**: consistente con el fondo actual del Canvas, no necesitamos transparencia
- **Calidad 80%**: balance óptimo entre nitidez y peso

Peso total estimado para 13 modelos: ~325-455 KB (vs. descargar 13 GLBs de varios MB cada uno).

### 4.4 Modelos existentes sin thumbnail (migración)

**Estrategia en dos fases:**

**Fase 1 — Fallback en el componente (inmediata):**
- `ModelCard` verifica `thumbnail_url`
- Si existe: muestra `<img>` estática
- Si es `null`: mantiene el Canvas WebGL actual como fallback
- Esto permite un rollout gradual sin romper nada

**Fase 2 — Generación retroactiva (script admin o manual):**
- Opción A: Botón admin "Generar thumbnail" por modelo individual
- Opción B: Script batch que abre cada GLB en un Canvas offscreen, captura, y sube
- La generación se hace client-side con `canvas.toDataURL()` / `canvas.toBlob()`

El fallback garantiza que la galería funciona durante toda la migración.

---

## 5. Flujo completo propuesto: Subida con thumbnail automático

### Flujo en `UploadForm.tsx`

```
1. Usuario selecciona archivo GLB
2. Se monta Canvas de preview (ya existe en el form actual, línea 148)
3. Usuario llena metadata y presiona "Subir"
4. NUEVO — Capturar thumbnail del Canvas de preview:
   a. Obtener referencia al canvas WebGL (gl.domElement)
   b. Renderizar un frame completo
   c. canvas.toBlob('image/webp', 0.8)
5. Subir GLB a Storage → models/{timestamp}-{nombre}.glb
6. NUEVO — Subir thumbnail a Storage → models/thumbnails/{timestamp}-{nombre}.webp
7. Obtener URL pública del thumbnail
8. Insert en tabla models con file_url + thumbnail_url
```

### Cambios necesarios en UploadForm.tsx

El Canvas de preview ya existe (línea 148). Necesitamos:

1. Añadir `ref` al Canvas para acceder al contexto WebGL
2. Antes del submit, capturar el frame:
   ```typescript
   // El Canvas de R3F expone gl a través de un ref o useThree
   const captureRef = useRef<HTMLCanvasElement>(null);
   
   // En el Canvas, añadir: gl={{ preserveDrawingBuffer: true }}
   // Esto permite leer píxeles después del render
   
   // Captura:
   const blob = await new Promise<Blob>((resolve) => {
     captureRef.current!.toBlob((b) => resolve(b!), 'image/webp', 0.8);
   });
   ```
3. Subir el blob como thumbnail antes del insert

**Nota importante**: el Canvas actual usa `gl={{ antialias: true }}`. Se debe agregar `preserveDrawingBuffer: true` para que `toBlob()` funcione. Esto tiene un costo menor de rendimiento pero solo afecta el form de subida, no la galería.

### Cambios necesarios en ModelCard.tsx

Reemplazar el bloque del Canvas (líneas 81-100) por:

```
Si thumbnail_url existe:
  → <img src={thumbnail_url} alt={title} loading="lazy" />
Si no:
  → Canvas actual (fallback para modelos sin thumbnail)
```

Esto elimina TODOS los contextos WebGL de la galería para modelos con thumbnail.

### Cambios necesarios en Gallery.tsx y SortableModelCard

- Pasar `thumbnailUrl={model.thumbnail_url}` como prop nueva a `ModelCard` y `SortableModelCard`

---

## 6. Resumen de archivos a modificar

| Archivo | Cambio |
|---------|--------|
| **Supabase (SQL)** | `ALTER TABLE models ADD COLUMN thumbnail_url TEXT NULL` |
| `src/lib/supabase.ts` | Agregar `thumbnail_url: string \| null` a `ModelRow` |
| `src/components/UploadForm.tsx` | Captura de thumbnail + upload antes del insert |
| `src/components/ModelCard.tsx` | Condicional: img estática vs Canvas (fallback) |
| `src/components/Gallery.tsx` | Pasar `thumbnailUrl` a ModelCard y SortableModelCard |
| `src/components/SortableModelCard.tsx` | Pasar `thumbnailUrl` al ModelCard interno |
| `src/components/EditModelForm.tsx` | Opción para regenerar thumbnail al editar |

---

## 7. Impacto en rendimiento esperado

| Métrica | Antes (13 Canvas) | Después (thumbnails) |
|---------|--------------------|---------------------|
| Contextos WebGL en galería | 13 (crash) | 0-1 (solo modal) |
| Descarga inicial galería | ~13 GLBs (decenas de MB) | ~13 WebP (~400 KB total) |
| Tiempo de carga galería | Lento (parse GLB + GPU) | Rápido (img nativas) |
| Memoria GPU | Alta (13 escenas) | Mínima (0 escenas) |
| WebGL Context Lost | Frecuente | Eliminado |

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| `toBlob()` no captura bien el modelo si no terminó de cargar | Esperar al evento `onLoad` del modelo antes de capturar |
| `preserveDrawingBuffer` reduce rendimiento | Solo se aplica en UploadForm, no en galería |
| Modelos existentes sin thumbnail | Fallback al Canvas actual + script de migración batch |
| Thumbnail no refleja ediciones al modelo | Regenerar thumbnail al editar (EditModelForm) |
| Bucket storage lleno | Los WebP pesan ~25 KB, impacto negligible vs GLBs de MB |

---

## 9. Orden de implementación sugerido

1. **Sprint 1**: SQL migration + actualizar `ModelRow` + fallback en `ModelCard`
2. **Sprint 2**: Captura automática en `UploadForm` + upload de thumbnail
3. **Sprint 3**: Script de migración para modelos existentes + botón admin "regenerar"
4. **Sprint 4**: Eliminar fallback Canvas de `ModelCard` cuando todos tengan thumbnail
