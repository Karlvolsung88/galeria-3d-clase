---
autor: Natalia Vargas Ospina
cargo: Arquitecta Web
fecha: 2026-04-10
tema: Separación de estados loading/refreshing en Gallery.tsx
estado: revision
---

## Resumen ejecutivo

Gallery.tsx tiene un estado `loading: boolean` que cumple dos responsabilidades
estructuralmente incompatibles: bloquear el render inicial hasta que haya datos, y
señalizar actualizaciones posteriores. Este doble uso es la causa directa del
problema de recarga: cada operación de escritura (subida, edición, borrado) desmonta
la totalidad del grid y fuerza la re-descarga de todos los archivos GLB.

La propuesta de separar en `initialLoading` + `refreshing` es arquitecturalmente
correcta. A continuación documento los detalles de implementación, los riesgos
secundarios y la estrategia para la race condition.

---

## 1. Diagnóstico del estado actual

### 1.1 El problema real: un boolean, dos semánticas

```typescript
// Gallery.tsx línea 20
const [loading, setLoading] = useState(true);
```

```typescript
// Gallery.tsx líneas 38-54
const loadModels = async () => {
  setLoading(true);   // ← ejecutado tanto en init() como en refreshes
  try {
    // queries...
  } finally {
    setLoading(false);
  }
};
```

```tsx
// Gallery.tsx líneas 188-217
{loading ? (
  <div className="gallery-loading">Cargando modelos...</div>
) : (
  filteredModels.map(model => <ModelCard ... />)
)}
```

Cuando `setLoading(true)` se ejecuta durante un refresh, React reemplaza el
árbol `filteredModels.map(...)` por `<div className="gallery-loading">`. Todos
los `<ModelCard>` se desmontan. Cada `<model-viewer>` dentro de ellos libera su
WebGL context, cancela la descarga en progreso y descarta el GLB de memoria.
Cuando `setLoading(false)` termina, React remonta todos los `<ModelCard>` desde
cero y `<model-viewer>` reinicia el ciclo completo de descarga.

El impacto es proporcional al número de modelos. Con 10 modelos de 5MB cada uno,
un refresh fuerza hasta 50MB de descargas redundantes.

### 1.2 Flujo actual verificado en el código

```
EditModelForm.onSave()
  → setEditingModel(null)
  → loadModels()                    // Gallery.tsx línea 253
      → setLoading(true)            // Grid desaparece
      → Promise.all([...queries])
      → setLoading(false)           // Grid reaparece, GLBs se re-descargan
```

```
UploadForm.onSuccess()
  → setShowUpload(false)
  → loadModels()                    // Gallery.tsx línea 243 — mismo problema

handleDelete()
  → supabase.storage.remove(...)
  → supabase.from('models').delete()
  → loadModels()                    // Gallery.tsx línea 151 — mismo problema
```

Los tres puntos de entrada a `loadModels()` sufren el mismo defecto.
Solo la llamada desde `init()` (línea 76) es semánticamente correcta al usar `setLoading(true)`.

---

## 2. Evaluación de la propuesta: `initialLoading` + `refreshing`

### 2.1 ¿Es la estrategia correcta?

**Sí.** La separación refleja la realidad de dos fases con comportamientos de UI
distintos:

| Estado | Primera carga | Refresh |
|--------|--------------|---------|
| No hay datos previos | Verdadero | Falso — hay datos |
| El grid debe desaparecer | Sí | No |
| El usuario espera | Activamente | Pasivamente |
| GLBs en memoria | Ninguno | Ya cargados |

Mantener ambas fases en un único boolean obliga al componente a elegir el
comportamiento más destructivo (desmontar el grid) porque no puede distinguir
entre ellas. La separación elimina esa ambigüedad de forma permanente y limpia.

### 2.2 Análisis del diseño propuesto

```typescript
const [initialLoading, setInitialLoading] = useState(true);
const [refreshing, setRefreshing] = useState(false);
```

**Fortalezas:**
- `initialLoading` comienza en `true` y solo puede transicionar a `false` una vez.
  Es un estado unidireccional, lo que elimina la posibilidad de usar erróneamente
  un spinner inicial en refreshes futuros.
- `refreshing` no controla si el grid existe. El grid siempre renderiza cuando
  `initialLoading` es `false`, independientemente de `refreshing`.
- La separación es legible: el nombre del estado comunica su propósito.

**Riesgo identificado — doble responsabilidad en `loadModels()`:**

La función `loadModels()` necesita saber si es la primera ejecución o un refresh
para saber qué estado actualizar. La propuesta implica manejar esto con un
parámetro o con lógica externa. Si no se diseña con cuidado, `loadModels()`
podría volverse frágil.

**Recomendación**: separar en dos rutas explícitas dentro de la función, usando
un parámetro booleano que no sea opcional, para forzar que el llamador sea
consciente de qué tipo de carga está haciendo:

```typescript
const loadModels = async (isInitial: boolean) => {
  if (isInitial) {
    setInitialLoading(true);
  } else {
    setRefreshing(true);
  }
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
  } finally {
    if (isInitial) {
      setInitialLoading(false);
    } else {
      setRefreshing(false);
    }
  }
};
```

Llamadas en el código:
```typescript
// En init():
await loadModels(true);

// En onSave, onSuccess, handleDelete:
loadModels(false);
```

Este diseño hace imposible confundir los dos tipos de carga porque el parámetro
es requerido y sin valor por defecto.

---

## 3. Race condition en `loadModels()`

### 3.1 ¿Puede ocurrir?

**Sí.** El escenario es factible aunque no frecuente en uso normal:

```
t=0ms  → Llamada A: setRefreshing(true), lanza Promise.all
t=50ms → Usuario borra otro modelo
t=50ms → Llamada B: setRefreshing(true), lanza Promise.all
t=300ms → Llamada A resuelve: setModels(dataA), setRefreshing(false)
t=400ms → Llamada B resuelve: setModels(dataB), setRefreshing(false)
```

El resultado final es `dataB`, que es el más reciente. En este caso específico,
la carrera es benigna porque Supabase devuelve el estado actual de la base de
datos en cada query — no hay writes locales que puedan perder. El estado final
siempre converge al último snapshot de la BD.

Sin embargo, existe un escenario donde la carrera sí deja estado inconsistente:

```
t=0ms  → Llamada A lanza queries
t=100ms → Llamada B lanza queries
t=500ms → Llamada B resuelve primero (red más rápida): setModels(dataB)
t=600ms → Llamada A resuelve: setModels(dataA)  ← sobreescribe dataB con datos más viejos
```

Si Supabase responde en orden inverso al de lanzamiento (posible con latencias
variables), los datos más viejos sobrescriben los más nuevos. El resultado es una
galería que no refleja la última operación del usuario.

### 3.2 Solución: AbortController + ref de cancelación

La estrategia más limpia en React sin librerías externas es un ref que trackea
la "versión" de la carga actual. Cualquier llamada más antigua que complete
después que una más nueva se descarta silenciosamente:

```typescript
const loadCounterRef = useRef(0);

const loadModels = async (isInitial: boolean) => {
  // Incrementar contador — este número identifica esta invocación
  loadCounterRef.current += 1;
  const thisLoad = loadCounterRef.current;

  if (isInitial) {
    setInitialLoading(true);
  } else {
    setRefreshing(true);
  }

  try {
    const [modelsRes, counts, commentCountsData] = await Promise.all([
      supabase.from('models').select('*').order('created_at', { ascending: false }),
      fetchLikeCounts(),
      fetchCommentCounts(),
    ]);

    // Solo aplicar si esta es todavía la carga más reciente
    if (loadCounterRef.current !== thisLoad) return;

    if (!modelsRes.error && modelsRes.data) setModels(modelsRes.data);
    setLikeCounts(counts);
    setCommentCounts(commentCountsData);
  } catch (err) {
    if (loadCounterRef.current !== thisLoad) return;
    console.error('Error loading models:', err);
  } finally {
    // Solo desactivar el spinner si seguimos siendo la carga activa
    if (loadCounterRef.current === thisLoad) {
      if (isInitial) {
        setInitialLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }
};
```

Esta técnica — llamada "stale closure cancellation" — es el patrón estándar de
React para operaciones asíncronas concurrentes sin introducir dependencias
externas. El ref no dispara re-renders y persiste entre renders, lo que lo hace
ideal para este propósito.

**Nota sobre AbortController con Supabase:** El cliente de Supabase no expone
una API de cancelación de queries equivalente a `fetch` con `AbortSignal`. El
patrón de ref es la alternativa apropiada para este stack.

---

## 4. Cambios mínimos en el JSX

El JSX actual tiene una estructura condicional única. La propuesta requiere un
cambio quirúrgico en dos niveles:

### Estado actual (líneas 188-217):
```tsx
{loading ? (
  <div className="gallery-loading">Cargando modelos...</div>
) : filteredModels.length === 0 ? (
  <div className="gallery-empty">...</div>
) : (
  filteredModels.map(model => <ModelCard ... />)
)}
```

### Estado propuesto:
```tsx
{initialLoading ? (
  <div className="gallery-loading">Cargando modelos...</div>
) : (
  <>
    {refreshing && (
      <div className="gallery-refreshing" aria-live="polite">
        Actualizando...
      </div>
    )}
    {filteredModels.length === 0 ? (
      <div className="gallery-empty">...</div>
    ) : (
      filteredModels.map(model => <ModelCard ... />)
    )}
  </>
)}
```

El grid de `ModelCard` siempre está presente cuando `initialLoading` es `false`.
El indicador `gallery-refreshing` es aditivo — aparece sobre el contenido
existente sin desplazarlo ni desmontarlo.

También hay que ajustar el contador (línea 183):
```tsx
// Antes:
{loading ? '...' : `${String(filteredModels.length).padStart(2, '0')} MODELOS`}

// Después:
{initialLoading ? '...' : `${String(filteredModels.length).padStart(2, '0')} MODELOS`}
```

---

## 5. Riesgos arquitecturales adicionales

### 5.1 Riesgo: `initialLoading` nunca llega a `false` si `init()` falla

En el código actual, `init()` llama a `loadModels(true)` que tiene `try/catch/finally`.
El `finally` garantiza que `setInitialLoading(false)` siempre se ejecute, incluso
si Supabase falla. Este punto ya está cubierto correctamente por el diseño propuesto
(y por el fix de `try/catch/finally` del informe de Sebastián del 2026-04-06).

Sin embargo, hay un riesgo residual: si `supabase.auth.getSession()` en `init()`
(línea 63 del código actual) lanza una excepción no capturada antes de llegar a
`loadModels()`, el componente queda atascado en `initialLoading: true`. Se recomienda
envolver todo el cuerpo de `init()` en un `try/catch/finally` que garantice
`setInitialLoading(false)` como fallback de último recurso.

### 5.2 Riesgo: el indicador `gallery-refreshing` necesita CSS que no bloquee interacción

El div de actualización no debe ocupar espacio en el grid ni desplazar las cards.
Debe implementarse con `position: fixed` o `position: absolute` sobre el grid,
o como un banner compacto fuera del flujo de grid. Si se implementa dentro del
flujo normal del DOM, podría desplazar el grid y causar layout shift.

### 5.3 Riesgo menor: `refreshing` podría quedar `true` si el componente se desmonta

El patrón `isMounted` ya existe en `useEffect` para el init. Si `loadModels()` se
llama desde un evento de usuario y el componente se desmonta antes de que resuelva,
`setRefreshing(false)` dispara un setState en componente desmontado. Esto produce
un warning en React 18 (aunque no rompe la app). La solución es verificar `isMounted`
antes de todos los setState en `loadModels()`, o usar el mismo ref de cancelación
descrito en la sección 3.2 que ya previene este caso como efecto secundario.

### 5.4 Consideración de rendimiento: likes y comments en cada refresh

`loadModels()` actualmente siempre recarga `fetchLikeCounts()` y `fetchCommentCounts()`
junto con los modelos. Para refreshes post-edición/borrado, esto es correcto porque
el modelo puede haber cambiado. Sin embargo, en un escenario de escala futura, podría
ser útil separar la recarga de contadores de la recarga de metadatos de modelos.
Este punto está fuera del scope del problema actual pero es una deuda técnica conocida.

---

## 6. Recomendación final

### Adoptar la separación `initialLoading` / `refreshing`: SÍ

La propuesta es correcta, proporcionada al problema y no introduce complejidad
innecesaria. Resuelve la causa raíz del problema de recarga sin afectar la lógica
de negocio existente.

### Implementar stale closure cancellation: SÍ

El costo de implementación es mínimo (un `useRef` y dos líneas de guarda) y el
beneficio es eliminar un vector de corrupción de estado que, aunque poco frecuente
en uso normal, puede ocurrir y es difícil de diagnosticar cuando aparece.

### Cambios mínimos necesarios

1. Reemplazar `const [loading, setLoading]` por dos estados separados.
2. Agregar `loadCounterRef` para cancelación de stale loads.
3. Refactorizar `loadModels()` con el parámetro `isInitial: boolean`.
4. Actualizar las tres llamadas a `loadModels()` (líneas 76, 151, 243, 253).
5. Ajustar el JSX del grid y del contador.
6. Agregar CSS mínimo para `.gallery-refreshing` que no genere layout shift.

**Total de archivos afectados: 1** — solo `Gallery.tsx`. No hay cambios en
Supabase, esquema de BD, ni en componentes hijos. El scope es quirúrgico.

---

## Referencias de código relevantes

- `Gallery.tsx` línea 20 — estado `loading` actual
- `Gallery.tsx` líneas 38-54 — función `loadModels()` actual
- `Gallery.tsx` líneas 59-96 — `useEffect` de init, patrón `isMounted` existente
- `Gallery.tsx` líneas 151, 243, 253 — tres puntos de llamada a `loadModels()`
- `Gallery.tsx` líneas 183, 188-217 — JSX afectado por el estado `loading`
- `docs/informes/2026-04-06-auditoria-loading-infinito.md` — contexto de `try/catch/finally`
