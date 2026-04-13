---
autor: Sebastian Torres Mejia
cargo: Senior Dev Astro/React
fecha: 2026-04-10
tema: Fix reordenamiento - upsert a update
estado: revision
---

# Diagnostico: Error 42501 en reordenamiento de modelos

## Problema

`updateModelOrder()` en `src/lib/supabase.ts` (linea 262) usa `upsert` para actualizar el `sort_order` de los modelos. En Supabase, `upsert` intenta primero un `INSERT` y si hay conflicto ejecuta `UPDATE`. El problema es que la politica RLS de INSERT en la tabla `models` restringe quien puede insertar (probablemente solo el owner del modelo o admin con condiciones especificas), y el `upsert` dispara esa politica INSERT antes de caer al UPDATE, resultando en error **42501 (insufficient_privilege)**.

## Flujo actual del drag-and-drop

1. Admin activa modo reordenar (`reorderMode = true`) en `Gallery.tsx`
2. `DndContext` + `SortableContext` renderizan `SortableModelCard` con `@dnd-kit`
3. Al soltar, `handleDragEnd` (linea 92) ejecuta:
   - `arrayMove()` reordena el array local
   - Genera `updates` con nuevo `sort_order` para TODOS los modelos: `{ id, sort_order: (i+1) * 1000 }`
   - Llama `updateModelOrder(updates)` que hace el `upsert` problematico
4. El upsert envia un array con todos los campos `{ id, sort_order }` y Supabase lo interpreta como INSERT con ON CONFLICT

## Causa raiz

`upsert` = INSERT ... ON CONFLICT DO UPDATE. Supabase evalua la politica INSERT **antes** de saber si hay conflicto. Como el rol `anon` o `authenticated` no tiene permiso INSERT general en `models` (o la policy requiere campos obligatorios como `title`, `file_url`, etc. que no se envian), falla con 42501.

## Fix propuesto

Reemplazar el `upsert` por updates individuales con `Promise.all`. Cada `update` solo dispara la politica UPDATE de RLS, que tipicamente permite al admin modificar cualquier fila.

### Codigo actual (src/lib/supabase.ts, lineas 262-272)

```typescript
export async function updateModelOrder(updates: { id: string; sort_order: number }[]): Promise<boolean> {
  const { error } = await supabase
    .from('models')
    .upsert(updates, { onConflict: 'id' });

  if (error) {
    console.error('Error updating model order:', error);
    return false;
  }
  return true;
}
```

### Codigo propuesto

```typescript
export async function updateModelOrder(updates: { id: string; sort_order: number }[]): Promise<boolean> {
  const results = await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase
        .from('models')
        .update({ sort_order })
        .eq('id', id)
    )
  );

  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    console.error('Error updating model order:', failed.map((r) => r.error));
    return false;
  }
  return true;
}
```

## Justificacion tecnica

| Aspecto | upsert (actual) | update individual (propuesto) |
|---------|-----------------|-------------------------------|
| Politica RLS | Dispara INSERT (falla) | Dispara solo UPDATE (OK) |
| Campos requeridos | Necesita todos los NOT NULL | Solo necesita sort_order |
| Requests HTTP | 1 request | N requests (uno por modelo) |
| Atomicidad | Una transaccion | No atomico, pero aceptable para sort_order |

## Consideracion de rendimiento

Con ~20-50 modelos en la galeria, `Promise.all` genera 20-50 requests paralelos. Esto es aceptable porque:
- Se ejecuta solo cuando el admin reordena (accion poco frecuente)
- Son queries UPDATE simples y rapidos
- El paralelismo reduce el tiempo total vs ejecucion secuencial

Si en el futuro la cantidad de modelos crece significativamente (>100), se podria considerar una funcion RPC en Supabase (`rpc('reorder_models', { updates })`) que ejecute todos los updates en una sola transaccion del lado servidor.

## Archivos afectados

- `src/lib/supabase.ts` - linea 262: reemplazar funcion `updateModelOrder`
- `src/components/Gallery.tsx` - **sin cambios**, la firma de la funcion no cambia

## Riesgo

**Bajo**. El cambio es quirurgico: misma firma, mismo comportamiento externo, solo cambia la estrategia de persistencia. El estado optimista en `Gallery.tsx` (linea 97-107) sigue funcionando igual porque `updateModelOrder` retorna el mismo `Promise<boolean>`.
