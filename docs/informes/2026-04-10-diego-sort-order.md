---
autor: Diego Ramírez Castellanos
cargo: Data Lead & Arquitecto de Datos
fecha: 2026-04-10
tema: Diseño de columna sort_order para reordenamiento de modelos
estado: revision
---

# Informe: Diseño de columna `sort_order` para reordenamiento manual de modelos

## Resumen ejecutivo

Este informe analiza el diseño óptimo de una columna de ordenamiento manual para la tabla `models` en Supabase. La decisión central es elegir entre `INTEGER` con gaps, `INTEGER` absoluto, y `FLOAT`. Hay además una pregunta de arquitectura no trivial sobre si el orden debe ser global o por categoría. Las recomendaciones son concretas, con SQL ejecutable y código TypeScript listo para integrarse en `src/lib/supabase.ts`.

---

## 1. Diseño de la columna: `FLOAT` vs `INTEGER`

### Opciones evaluadas

| Opción | Ventaja | Problema |
|--------|---------|---------|
| `INTEGER` absoluto (1, 2, 3...) | Simple de entender | Insertar entre dos filas obliga a renumerar todas las siguientes |
| `INTEGER` con gaps (10, 20, 30...) | Permite ~8 inserciones entre valores sin renumerar | Eventualmente se agotan los huecos; mismo problema a escala |
| `FLOAT` (DOUBLE PRECISION) | Inserción entre A y B = (A + B) / 2, sin renumerar jamás | Degradación de precisión tras ~50 inserciones consecutivas en el mismo hueco |

### Recomendación: `INTEGER` con gaps de 1000

Para una galería de clase con volumen bajo (20-60 modelos máximo esperados), `FLOAT` agrega complejidad sin beneficio real. Los gaps de 1000 permiten hasta 999 inserciones entre cualquier par de modelos sin renumerar. Si en algún momento los gaps se agotan (escenario muy improbable en este contexto), una renumeración completa toma milisegundos en PostgreSQL.

**Justificación adicional:**

- `FLOAT` introduce comparaciones de punto flotante en el índice, que son más lentas que comparaciones de enteros para `ORDER BY`.
- `INTEGER` es más seguro en la capa JS: no hay riesgo de `0.30000000000000004` enviado al servidor.
- La renumeración completa, cuando ocurre, es una operación de mantenimiento simple: `UPDATE models SET sort_order = ROW_NUMBER() OVER (ORDER BY sort_order) * 1000`.

**Decisión final:** `sort_order INTEGER NOT NULL DEFAULT 0` con valores inicializados en múltiplos de 1000.

---

## 2. Valor inicial al migrar filas existentes

El orden visual actual en la app es `created_at DESC` (los más recientes primero). La migración debe respetar ese orden: el modelo más reciente recibe `sort_order = 1000`, el siguiente `sort_order = 2000`, y así sucesivamente.

### SQL de migración completo (seguro para producción)

```sql
-- PASO 1: Agregar la columna con valor temporal permitiendo NULL
-- (necesario porque no podemos calcular el valor correcto con un DEFAULT estático)
ALTER TABLE models
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- PASO 2: Inicializar sort_order basado en created_at DESC
-- El modelo más reciente queda en la posición 1 (sort_order = 1000)
-- Esto mantiene el orden visual que los usuarios ya conocen
UPDATE models
SET sort_order = sub.rn * 1000
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
  FROM models
) AS sub
WHERE models.id = sub.id;

-- PASO 3: Ahora que todas las filas tienen valor, agregar la restricción NOT NULL
ALTER TABLE models
  ALTER COLUMN sort_order SET NOT NULL;

-- PASO 4: Agregar DEFAULT para filas futuras
-- Nuevos modelos sin sort_order explícito irán al final (valor 0 los pondría al inicio)
-- Usamos un valor alto para que nuevos modelos vayan al final por defecto
ALTER TABLE models
  ALTER COLUMN sort_order SET DEFAULT 2147483647;
```

> **Nota sobre el DEFAULT para nuevas filas:** El valor `2147483647` es el máximo de `INTEGER` en PostgreSQL. Cualquier modelo nuevo subido sin asignar posición explícita aparecerá al final del listado. El admin puede reordenarlo después. Esto es más predecible que `0`, que lo pondría al principio.

---

## 3. Orden global vs. orden por categoría

Esta es la decisión arquitectónica más importante del informe.

### Análisis del problema

La app tiene filtros de categoría en `Gallery.tsx` (línea 130-133). El filtro es puramente del lado del cliente — todos los modelos se cargan desde Supabase y `filteredModels` es un `useMemo` que filtra el array local. No hay query separada por categoría.

**Escenario con orden global:**

El admin tiene 10 modelos en total: 3 personajes (posiciones 1000, 3000, 7000) y 7 vehículos intercalados. Filtra por "Personaje" y ve los 3 cards. Hace drag para mover el de posición 7000 al primer lugar. El resultado correcto es asignarle `sort_order < 1000`, por ejemplo `500`. Cuando el admin vuelve a "Todos", ese personaje aparece primero de toda la galería.

**¿Es esto deseable?** Depende del caso de uso pedagógico:

| Contexto | Orden global | Orden por categoría |
|----------|-------------|---------------------|
| El prof quiere destacar un trabajo destacado en toda la galería | ✓ Natural | ✗ Requiere tabla separada |
| El prof quiere curar el orden dentro de cada categoría independientemente | ✗ Complejo | ✓ Natural |
| Complejidad de implementación | Baja | Alta (columna extra o tabla junction) |
| Complejidad de SQL | Baja | Media |
| Complejidad de UX en drag & drop | Baja | Media (debe bloquear drag entre categorías) |

### Recomendación: orden global en la primera versión

**Razón pragmática:** La galería es una aplicación de aula con un solo admin (el profesor) y un volumen pequeño de modelos. El overhead de implementar orden por categoría (ya sea con una columna `sort_order_personaje`, `sort_order_vehiculo`... o con una tabla junction `model_category_order`) no justifica el beneficio en este contexto.

**Comportamiento esperado con orden global:**

- El admin ve el listado completo (filtro "Todos") y ordena drag & drop toda la galería.
- Si filtra por categoría y reordena, está moviendo esas cards en el contexto global, lo cual es técnicamente correcto pero visualmente puede confundir.
- **Mitigación en UX:** Cuando el admin está en un filtro de categoría, el drag & drop debe estar deshabilitado o mostrar un aviso: "El reordenamiento funciona en la vista 'Todos'." Esto evita confusión.

**Cómo implementar orden por categoría en el futuro (si se necesita):**

```sql
-- Opción futura: sort_order separado por categoría
-- (NO implementar ahora — registrado aquí solo para referencia)
ALTER TABLE models
  ADD COLUMN sort_order_categoria INTEGER;
-- Requiere una query diferente por categoría y lógica más compleja en drag & drop
```

---

## 4. SQL completo de implementación

### 4a. Migración de columna

(Ver sección 2 arriba para el SQL de migración completo.)

### 4b. Índice para performance

```sql
-- Índice para que ORDER BY sort_order sea O(log n) en lugar de O(n)
-- El índice cubre también las queries filtradas por categoría
CREATE INDEX IF NOT EXISTS idx_models_sort_order
  ON models (sort_order ASC);

-- Índice compuesto si se quiere soportar filtros por categoría con orden eficiente
-- (útil aunque el filtrado sea client-side — las queries de Supabase incluyen ORDER BY)
CREATE INDEX IF NOT EXISTS idx_models_category_sort
  ON models (category, sort_order ASC);
```

### 4c. Verificación de RLS

La política de UPDATE existente para admin cubre esta columna automáticamente. En PostgreSQL/Supabase, las políticas RLS operan a nivel de **fila**, no de columna. Si el admin puede hacer UPDATE en una fila, puede actualizar cualquier columna de esa fila que no esté protegida por un trigger.

```sql
-- Verificar las políticas RLS existentes en la tabla models
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'models';

-- El resultado esperado debe incluir una política como:
-- policyname: "Admin can update any model"
-- cmd: UPDATE
-- roles: {authenticated}  (con check que verifica role = 'admin')

-- NO se necesita policy nueva. La columna sort_order queda cubierta
-- por la política UPDATE existente.
```

**Nota de seguridad:** Si en el futuro se quiere impedir que estudiantes cambien su propio `sort_order` (aunque sí puedan editar otros campos de sus modelos), sería necesario un trigger `BEFORE UPDATE` que revise `NEW.sort_order != OLD.sort_order` y valide el rol. Por ahora, dado que los estudiantes no pueden editar modelos de otros y el `sort_order` no tiene valor para ellos, esto no es un vector de ataque relevante.

---

## 5. Query de actualización masiva desde TypeScript

### Estrategia recomendada: upsert por `id`

No hay una sintaxis nativa de "UPDATE múltiples filas con valores diferentes" en SQL estándar que Supabase JS exponga directamente. Las opciones son:

| Estrategia | Latencia | Complejidad | Adecuada para |
|-----------|----------|-------------|---------------|
| N UPDATEs en secuencia | Alta (N round-trips) | Baja | < 5 modelos |
| `Promise.all` con N UPDATEs | Media (N paralelos) | Baja | 5-20 modelos |
| Upsert masivo por `id` | Baja (1 round-trip) | Media | Cualquier N |
| RPC PostgreSQL con array | Muy baja | Alta | > 100 modelos |

Para una galería de clase (máximo ~60 modelos), **el upsert masivo en un solo round-trip es la solución correcta.**

### Snippet TypeScript para `src/lib/supabase.ts`

```typescript
/**
 * Actualiza el sort_order de múltiples modelos en una sola operación.
 * 
 * @param updates - Array de { id: UUID del modelo, sort_order: nuevo valor }
 * @returns true si la operación fue exitosa, false en caso de error
 * 
 * Estrategia: upsert en la tabla models usando el PK (id) como columna de conflicto.
 * Supabase traduce esto a un INSERT ... ON CONFLICT (id) DO UPDATE SET sort_order = EXCLUDED.sort_order
 * que PostgreSQL ejecuta en una sola transacción atómica.
 * 
 * IMPORTANTE: Solo enviar las columnas id y sort_order en el upsert para evitar
 * sobrescribir accidentalmente otros campos. Supabase upsert con ignoreDuplicates: false
 * hace MERGE completo, por eso limitamos las columnas explícitamente.
 */
export async function updateModelsOrder(
  updates: { id: string; sort_order: number }[]
): Promise<boolean> {
  if (updates.length === 0) return true;

  const { error } = await supabase
    .from('models')
    .upsert(updates, {
      onConflict: 'id',          // columna de conflicto = PK
      ignoreDuplicates: false,   // false = hacer UPDATE (no ignorar)
    });

  if (error) {
    console.error('Error actualizando sort_order:', error);
    return false;
  }

  return true;
}
```

### Uso desde el componente de drag & drop (ejemplo)

```typescript
// Cuando el admin termina el drag, recalcular sort_order de todas las cards visibles
// y llamar a la función de actualización

const handleDragEnd = async (reorderedModels: ModelRow[]) => {
  // Asignar sort_order en gaps de 1000 basado en la posición visual final
  const updates = reorderedModels.map((model, index) => ({
    id: model.id,
    sort_order: (index + 1) * 1000,
  }));

  const success = await updateModelsOrder(updates);
  
  if (!success) {
    // Revertir el estado local si falla el servidor
    console.error('No se pudo guardar el nuevo orden');
    // llamar a loadModels() para recuperar el orden del servidor
  }
};
```

### Consideración sobre renumeración

Cuando el admin hace drag repetidamente, eventualmente puede fragmentar los valores (ejemplo: 1000, 1500, 1750, 1875...). Esto no es un problema operativo, pero si los valores se acercan mucho entre sí (gap < 10), conviene renumerar. La estrategia más simple es renumerar automáticamente después de cada operación de drag: siempre asignar `(index + 1) * 1000` a todos los modelos visibles. Esto normaliza los gaps en cada operación sin costo adicional (ya se está haciendo un upsert de todos modos).

---

## 6. Impacto en el código existente (`Gallery.tsx`)

La query actual en línea 56:

```typescript
supabase.from('models').select('*').order('created_at', { ascending: false })
```

Debe cambiarse a:

```typescript
supabase.from('models').select('*').order('sort_order', { ascending: true })
```

Este es el único cambio necesario en el componente. El filtrado por categoría (líneas 130-133) es puramente client-side sobre el array ya ordenado, por lo que funciona correctamente sin modificación.

La interfaz `ModelRow` en `src/lib/supabase.ts` debe extenderse:

```typescript
export interface ModelRow {
  // ... campos existentes ...
  sort_order: number;  // <-- agregar
}
```

---

## 7. Plan de implementación sugerido (orden de pasos)

1. Ejecutar la migración SQL en Supabase Dashboard (SQL Editor) — sección 2 y 4b de este informe.
2. Verificar la migración: `SELECT id, title, sort_order FROM models ORDER BY sort_order LIMIT 10;`
3. Actualizar `ModelRow` en `supabase.ts` para incluir `sort_order`.
4. Agregar función `updateModelsOrder` a `supabase.ts`.
5. Cambiar la query en `Gallery.tsx` a `order('sort_order', { ascending: true })`.
6. Implementar el componente de drag & drop (responsabilidad de Isabella Moreno Ríos, Frontend 3D).
7. Deshabilitar drag & drop cuando `activeFilter !== 'all'` con un tooltip explicativo.

---

## Conclusión

La columna `sort_order INTEGER` con gaps de 1000, inicializada por `created_at DESC`, es la solución con mejor balance de simplicidad y funcionalidad para este contexto. El orden global (no por categoría) es correcto para la primera versión y debe acompañarse de una restricción UX que deshabilite el reordenamiento cuando hay un filtro activo. La actualización masiva con upsert en un solo round-trip garantiza consistencia y performance adecuada para el volumen esperado.

---

*Informe elaborado por Diego Ramírez Castellanos — Data Lead & Arquitecto de Datos*  
*Proyecto: Galería 3D — Estudio de Creación Digital IV*
