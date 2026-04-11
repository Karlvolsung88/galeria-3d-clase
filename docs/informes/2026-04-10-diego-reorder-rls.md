---
autor: Diego Ramírez Castellanos
cargo: Data Lead & Arquitecto de Datos
fecha: 2026-04-10
tema: Auditoría RLS - Reordenamiento de modelos
estado: revision
---

# Auditoría RLS: Error 42501 en reordenamiento de modelos

## Diagnóstico

El error PostgreSQL **42501** es `insufficient_privilege` — la política RLS de la tabla `models` está rechazando la operación.

### Causa raíz: `upsert` dispara INSERT, no UPDATE

El código actual en `src/lib/supabase.ts` línea 262-272:

```typescript
const { error } = await supabase
  .from('models')
  .upsert(updates, { onConflict: 'id' });
```

Supabase traduce `upsert` a SQL como:

```sql
INSERT INTO models (id, sort_order)
VALUES ('uuid-1', 1000), ('uuid-2', 2000), ...
ON CONFLICT (id) DO UPDATE SET sort_order = EXCLUDED.sort_order;
```

El problema es que PostgreSQL evalua **ambas** politicas RLS en un upsert:

1. **Politica INSERT** — se evalua ANTES del `ON CONFLICT`. PostgreSQL necesita verificar que el usuario tiene permiso de INSERT en la fila, incluso si la fila ya existe y la operacion real sera un UPDATE.
2. **Politica UPDATE** — se evalua para el `DO UPDATE SET`.

Si la politica INSERT de `models` requiere que el `user_id` del registro coincida con `auth.uid()` (tipica politica "users can insert their own models"), los objetos `{id, sort_order}` que envia el frontend **no incluyen `user_id`**. PostgreSQL no puede evaluar la condicion `user_id = auth.uid()` porque `user_id` es NULL en el payload del INSERT, y la politica rechaza la operacion con 42501.

### Por que el admin tambien falla

Incluso si existe una politica "admin can do anything" para UPDATE, no ayuda. El upsert requiere pasar **primero** la politica INSERT. Si la politica INSERT verifica `user_id = auth.uid()` y el payload no tiene `user_id`, falla antes de llegar al UPDATE.

Escenario probable de las politicas actuales:

| Politica | cmd | Condicion probable |
|----------|-----|-------------------|
| "Users can insert own models" | INSERT | `auth.uid() = user_id` |
| "Admin can update any model" | UPDATE | `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')` |
| "Anyone can read models" | SELECT | `true` |

El upsert necesita pasar INSERT + UPDATE. Falla en INSERT porque `user_id` no esta en el payload.

### Confirmacion: `upsertStudentSkills` funciona, `updateModelOrder` no

Comparando con la funcion `upsertStudentSkills` (linea 276-297), que SI funciona:

```typescript
const rows = skills.map((s) => ({
  user_id: userId,     // <-- incluye user_id
  skill_name: s.skill_name,
  value: s.value,
  updated_at: new Date().toISOString(),
}));
await supabase.from('student_skills').upsert(rows, { onConflict: 'user_id,skill_name' });
```

`student_skills` incluye `user_id` en el payload, por lo que la politica INSERT puede evaluarse correctamente. En `updateModelOrder`, el payload solo tiene `{id, sort_order}` — sin `user_id`, sin `title`, sin ningun otro campo requerido por la politica INSERT.

---

## Solucion recomendada

**Reemplazar `upsert` por updates individuales en paralelo.** No hay necesidad de usar INSERT semantics cuando estamos actualizando filas existentes.

### Opcion A: Updates paralelos con `Promise.all` (recomendada)

```typescript
export async function updateModelOrder(
  updates: { id: string; sort_order: number }[]
): Promise<boolean> {
  if (updates.length === 0) return true;

  const results = await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase
        .from('models')
        .update({ sort_order })
        .eq('id', id)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error('Error updating model order:', failed.error);
    return false;
  }
  return true;
}
```

**Ventajas:**
- Solo dispara la politica UPDATE de RLS, que ya permite al admin actualizar cualquier modelo.
- No requiere `user_id` en el payload.
- Cada update es una operacion atomica individual.

**Desventajas:**
- N round-trips en paralelo en vez de 1. Para 20-60 modelos esto agrega ~100-300ms de latencia total. Aceptable para una operacion de admin que ocurre esporadicamente.

### Opcion B: RPC con funcion PostgreSQL (alternativa robusta)

Si se quiere mantener una sola transaccion atomica:

```sql
CREATE OR REPLACE FUNCTION reorder_models(payload JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- ejecuta con permisos del owner, bypasea RLS
AS $$
DECLARE
  item JSONB;
BEGIN
  -- Verificar que el caller es admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden reordenar modelos';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(payload)
  LOOP
    UPDATE models
    SET sort_order = (item->>'sort_order')::integer
    WHERE id = (item->>'id')::uuid;
  END LOOP;
END;
$$;
```

Llamada desde TypeScript:

```typescript
const { error } = await supabase.rpc('reorder_models', {
  payload: JSON.stringify(updates)
});
```

**Ventajas:** Una sola transaccion, atomica, sin problemas de RLS.
**Desventajas:** Requiere crear la funcion en Supabase SQL Editor. Mas mantenimiento.

### Opcion C: Agregar politica INSERT permisiva para admin (NO recomendada)

Se podria agregar una politica INSERT que permita al admin insertar cualquier cosa:

```sql
CREATE POLICY "Admin can insert any model"
ON models FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
```

**No la recomiendo** porque:
- Abre la puerta a que el admin haga INSERT accidental de filas parciales (solo id + sort_order) que corrompen datos.
- El upsert con payload parcial (`{id, sort_order}`) intentaria insertar una fila sin `title`, `student`, `file_url`, etc., violando restricciones NOT NULL de esas columnas. Asi que ni siquiera funcionaria.

---

## Recomendacion final

**Implementar Opcion A** (updates paralelos con `Promise.all`). Es el cambio minimo, no requiere migraciones SQL, y resuelve el problema directamente usando la semantica correcta: estamos haciendo UPDATE, no INSERT.

Si en el futuro el volumen de modelos crece significativamente o se necesita atomicidad transaccional, migrar a Opcion B (RPC).

### Verificacion necesaria

Antes de implementar, confirmar las politicas RLS ejecutando en Supabase SQL Editor:

```sql
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'models';
```

Esto confirmara la estructura exacta de las politicas y validara el diagnostico.

---

*Informe elaborado por Diego Ramirez Castellanos — Data Lead & Arquitecto de Datos*
*Proyecto: Galeria 3D — Estudio de Creacion Digital IV*
