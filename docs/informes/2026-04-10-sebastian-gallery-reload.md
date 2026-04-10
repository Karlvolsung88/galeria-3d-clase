---
autor: Sebastián Torres Mejía
cargo: Senior Dev Astro/React
fecha: 2026-04-10
tema: Análisis — Problemas de recarga de modelos 3D en Gallery.tsx
estado: revision
---

## Resumen ejecutivo

`Gallery.tsx` usa un único flag `loading` para cubrir dos situaciones
distintas: la carga inicial (donde el spinner es necesario y correcto)
y las recargas posteriores a mutaciones — upload, edit, delete — (donde
es destructivo). Cada vez que `loadModels()` se ejecuta tras una
mutación, el grid completo se desmonta, `model-viewer` destruye sus
contextos WebGL, y todos los GLB se vuelven a descargar desde Supabase
Storage. El resultado visible es exactamente lo que reporta el usuario:
blancos, parpadeos y spinners que no terminan. El problema tiene tres
dimensiones técnicas, analizadas a continuación.

---

## Problema 1 — El flag `loading` destruye contextos WebGL en cada mutación

### Descripción

En `Gallery.tsx` línea 39, `loadModels` comienza siempre con
`setLoading(true)`. El JSX del grid (líneas 189-216) renderiza de forma
condicional:

```tsx
{loading ? (
  <div className="gallery-loading">Cargando modelos...</div>
) : (
  filteredModels.map((model) => (
    <ModelCard key={model.id} ... />
  ))
)}
```

Cuando `loading` pasa a `true`, React desmonta cada `<ModelCard>` y con
él cada instancia de `<model-viewer>`. El custom element de Google
destruye su contexto WebGL durante el `disconnectedCallback`. Cuando
`loading` vuelve a `false`, React monta nuevas instancias de
`<ModelCard>` con nuevas instancias de `<model-viewer>`, que deben:

1. Crear un nuevo contexto WebGL.
2. Descargar el GLB de Supabase Storage de cero (no hay caché HTTP
   efectivo porque Supabase Storage devuelve URLs firmadas con tokens
   que cambian).
3. Parsear y compilar shaders.

Este ciclo ocurre en cada upload (`onSuccess → loadModels`), en cada
edit (`onSave → loadModels`) y en cada delete (`handleDelete →
loadModels`). Con una galería de N modelos, esto representa N
descargas GLB innecesarias por cada operación.

### Verificación en el código real

```
Línea 151: loadModels();                       // handleDelete
Línea 243: onSuccess={() => { ... loadModels(); }} // UploadForm
Línea 253: onSave={() => { ... loadModels(); }}    // EditModelForm
```

Las tres rutas de mutación llaman a `loadModels()` sin distinción,
activando siempre el desmontaje del grid.

### Gravedad: ALTA

El desmontaje masivo de contextos WebGL es la causa directa de los
blancos y parpadeos. Es el problema principal a resolver.

---

## Problema 2 — Race condition por llamadas concurrentes sin cancelación

### Descripción

`loadModels` es una función async sin mecanismo de cancelación. Si se
invoca dos veces en rápida sucesión — por ejemplo, el usuario hace
doble clic en "Eliminar", o un cambio de auth state (línea 79) se
dispara mientras un upload completa — dos instancias de la función
corren en paralelo:

```
Instancia A:  setLoading(true) → [fetch] → setModels(dataA) → setLoading(false)
Instancia B:        setLoading(true) → [fetch] → setModels(dataB) → setLoading(false)
```

El orden en que se resuelven las Promises determina qué datos quedan en
pantalla. Si la instancia A (más antigua, con datos desactualizados) se
resuelve después de B, `setModels(dataA)` sobreescribe los datos
correctos de B. El spinner puede parpadear de true a false y de vuelta,
y los counts de likes/comments pueden quedar desfasados.

### Verificación en el código real

El `useEffect` de la línea 56 tiene un guard `isMounted` (línea 57),
pero ese guard protege únicamente el efecto de inicialización. La
función `loadModels` que se llama desde `handleDelete`, `UploadForm` y
`EditModelForm` no tiene ningún guard equivalente. No hay ref de
cancelación, no hay token de "última llamada ganadora", no hay
AbortController.

### Gravedad: MEDIA

No es el causa del parpadeo visual (eso es el Problema 1), pero sí
puede provocar datos inconsistentes — el contador de modelos muestra
el valor equivocado, o un modelo recién eliminado reaparece por un
instante.

---

## Problema 3 — `loadModels` no es estable como dependencia React

### Descripción

`loadModels` se define en el cuerpo del componente (línea 38) sin
`useCallback`. Esto significa que en cada render se crea una nueva
referencia de función. Actualmente esto no causa bugs directos porque
`loadModels` no se pasa como prop ni aparece en ningún array de
dependencias de `useEffect`. El único `useEffect` (línea 56) la llama
a través de la función `init` interna, donde la captura por closure es
segura.

Sin embargo, si en el futuro se agrega `loadModels` a un array de
dependencias, o se pasa a un hijo como callback, se producirá un
bucle de re-renders infinito. Es una deuda técnica con riesgo de
explosión futura.

### Gravedad: BAJA (deuda técnica, no bug activo)

---

## Evaluación de la solución propuesta

La propuesta original de separar `loading` (primera carga) de
`refreshing` (mutaciones posteriores) es correcta en su diagnóstico y
en su dirección. Se ajusta y se completa a continuación.

### Ajuste 1: el flag `refreshing` no debe tocar el grid

La propuesta sugiere "mostrar un indicador sutil en el header". Correcto.
El grid debe permanecer montado durante `refreshing`. Solo los datos
(`models`, `likeCounts`, `commentCounts`) se actualizan, y React hace
un reconcile eficiente actualizando únicamente las props que cambiaron
en cada `ModelCard`. Los `<model-viewer>` ya montados no se
desmontarán.

### Ajuste 2: el guard de cancelación debe ser un ref de versión, no un AbortController

Para las queries de Supabase (que no son fetch nativo), la forma más
limpia de cancelar una llamada "stale" es comparar un número de
versión. Cada vez que se inicia una nueva llamada, se incrementa el
contador; al recibir la respuesta, si el contador ya cambió, se
descarta el resultado.

### Ajuste 3: `useCallback` solo para `loadModels`

Solo `loadModels` necesita `useCallback` porque es la única función
que se llama desde múltiples lugares. Las demás funciones de evento
(`handleToggleLike`, `handleDelete`, etc.) son estables en su contexto
actual.

---

## Solución concreta — Código exacto a cambiar

### Paso 1: añadir estados y refs necesarios (líneas 20 y 32)

Reemplazar:

```typescript
const [loading, setLoading] = useState(true);
const modalCounter = useRef(0);
```

Por:

```typescript
const [initialLoading, setInitialLoading] = useState(true);
const [refreshing, setRefreshing] = useState(false);
const modalCounter = useRef(0);
const loadVersionRef = useRef(0);
```

`initialLoading` controla el spinner de primera carga (grid no existe
todavía). `refreshing` controla el indicador sutil durante mutaciones
(grid permanece montado). `loadVersionRef` es el guard de race
condition.

### Paso 2: reescribir `loadModels` con `useCallback` y guard de versión

Reemplazar la función completa (líneas 38-54):

```typescript
const loadModels = useCallback(async (isInitial = false) => {
  if (isInitial) {
    setInitialLoading(true);
  } else {
    setRefreshing(true);
  }

  // Incrementar versión: cualquier llamada anterior que aún no resolvió
  // descartará su resultado al comparar
  loadVersionRef.current += 1;
  const thisVersion = loadVersionRef.current;

  try {
    const [modelsRes, counts, commentCountsData] = await Promise.all([
      supabase.from('models').select('*').order('created_at', { ascending: false }),
      fetchLikeCounts(),
      fetchCommentCounts(),
    ]);

    // Si llegó una llamada más nueva mientras esperábamos, salir sin tocar state
    if (thisVersion !== loadVersionRef.current) return;

    if (!modelsRes.error && modelsRes.data) setModels(modelsRes.data);
    setLikeCounts(counts);
    setCommentCounts(commentCountsData);
  } catch (err) {
    console.error('Error loading models:', err);
  } finally {
    if (thisVersion === loadVersionRef.current) {
      if (isInitial) setInitialLoading(false);
      else setRefreshing(false);
    }
  }
}, []);
```

Nota: `useCallback` requiere importar `useCallback` en la línea 1
(actualmente solo está importado `useState, useMemo, useRef, useEffect`).

### Paso 3: actualizar la llamada inicial en `init` (línea 76)

Reemplazar:

```typescript
await loadModels();
```

Por:

```typescript
await loadModels(true);
```

### Paso 4: actualizar el JSX del grid (líneas 188-217)

Reemplazar:

```tsx
{/* Grid */}
<div className="gallery-grid">
  {loading ? (
    <div className="gallery-loading">Cargando modelos...</div>
  ) : filteredModels.length === 0 ? (
```

Por:

```tsx
{/* Grid */}
<div className="gallery-grid">
  {initialLoading ? (
    <div className="gallery-loading">Cargando modelos...</div>
  ) : filteredModels.length === 0 ? (
```

El resto del JSX del grid no cambia. Las cards permanecen montadas
durante `refreshing`.

### Paso 5: añadir indicador visual de `refreshing` en el contador (líneas 181-185)

Reemplazar:

```tsx
<div style={{ padding: '16px 48px 0' }}>
  <span className="counter">
    {loading ? '...' : `${String(filteredModels.length).padStart(2, '0')} MODELOS`}
  </span>
</div>
```

Por:

```tsx
<div style={{ padding: '16px 48px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
  <span className="counter">
    {initialLoading ? '...' : `${String(filteredModels.length).padStart(2, '0')} MODELOS`}
  </span>
  {refreshing && (
    <span style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.05em' }}>
      actualizando...
    </span>
  )}
</div>
```

### Paso 6: actualizar `handleDelete` para que no llame con `isInitial` (línea 151)

El valor por defecto de `isInitial` ya es `false`, por lo que la
llamada existente `loadModels()` funciona correctamente sin cambios.
No hay que modificar esta línea.

### Resumen de archivos a modificar

| Archivo | Líneas afectadas | Tipo de cambio |
|---------|-----------------|----------------|
| `src/components/Gallery.tsx` | 1 (import) | Agregar `useCallback` al import |
| `src/components/Gallery.tsx` | 20-21 | Reemplazar `loading` por `initialLoading` + `refreshing` |
| `src/components/Gallery.tsx` | 32 (después de `modalCounter`) | Agregar `loadVersionRef` |
| `src/components/Gallery.tsx` | 38-54 | Reescribir `loadModels` |
| `src/components/Gallery.tsx` | 76 | Cambiar `loadModels()` a `loadModels(true)` |
| `src/components/Gallery.tsx` | 181-185 | Actualizar contador con indicador de `refreshing` |
| `src/components/Gallery.tsx` | 189 | Cambiar `loading` a `initialLoading` en el ternario del grid |

---

## Impacto esperado tras implementar

| Síntoma original | Causa | Resultado tras fix |
|-----------------|-------|-------------------|
| Blancos al subir/editar/eliminar | Desmontaje de `model-viewer` por `loading=true` | Cards permanecen montadas, sin redescarga |
| Parpadeos del grid completo | Ciclo mount/unmount por flag único | Eliminado — el grid nunca se desmonta en mutaciones |
| Spinners que no terminan | Sin relación directa (el `finally` es correcto) | Sin cambio en este aspecto |
| Datos inconsistentes tras doble acción | Race condition sin guard | Resuelto por `loadVersionRef` |
| Riesgo de bucle infinito futuro | `loadModels` sin `useCallback` | Resuelto |

---

## Recomendación final

Implementar los seis pasos en un único commit atómico. El cambio es
quirúrgico: no altera la lógica de auth, ni los handlers de likes, ni
los formularios de upload/edit. Solo reorganiza cómo se gestiona el
estado de carga. El riesgo de regresión es bajo.

Proponemos que Claude Renard presente este plan al usuario para
aprobación antes de implementar.

---

## Referencia de archivos revisados

- `src/components/Gallery.tsx` — completo (304 líneas)
