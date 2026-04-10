---
autor: Sebastián Torres Mejía
cargo: Senior Dev Astro/React
fecha: 2026-04-10
tema: Implementación drag-and-drop para reordenamiento de modelos (admin)
estado: revision
---

# Informe Técnico: Drag-and-Drop para Reordenamiento de Modelos (Admin)

## Resumen ejecutivo

Este informe analiza la estrategia técnica para implementar reordenamiento de
tarjetas mediante drag-and-drop exclusivo para el rol `admin` en `Gallery.tsx`.
Se evalúan tres librerías candidatas, se define el flujo de interacción, la
estrategia de persistencia en Supabase y el impacto sobre los filtros por
categoría. El análisis parte del código real del proyecto — ninguna decisión es
teórica.

---

## 1. Evaluación de librerías

### Candidatos

| Librería | Versión actual | React 19 | Touch | Bundle (min+gz) | Estado |
|---|---|---|---|---|---|
| `@dnd-kit/core` + `@dnd-kit/sortable` | 6.x | Sí (sin wrappers legacy) | Sí, nativo | ~11 KB | Activo |
| `react-beautiful-dnd` | 13.x | No (usa `ReactDOM.findDOMNode` deprecado) | Parcial | ~29 KB | Abandonado |
| HTML5 Drag and Drop API nativa | — | Sí | No (touch no soportado en móviles sin polyfill) | 0 KB | N/A |

### Análisis por candidato

**`react-beautiful-dnd`**: descartado. La librería lleva sin releases desde 2022
y depende internamente de `ReactDOM.findDOMNode`, eliminado en React 19. Genera
warning fatal en modo estricto e incompatibilidad real en producción con Astro 6
+ React 19. No es una opción viable.

**HTML5 nativo**: descartado para touch. El proyecto se usa en clase donde los
estudiantes acceden desde tablets y móviles. Los eventos `dragstart`/`drop` del
navegador no funcionan en iOS/Android sin un polyfill pesado. Además, el
feedback visual (placeholder durante el drag) requiere código manual considerable
que duplica lo que una librería ya resuelve.

**`@dnd-kit/core` + `@dnd-kit/sortable`**: recomendado. Es la librería de
referencia para drag-and-drop en React moderno. Funciona con React 19 sin
adaptadores. Usa Pointer Events API en lugar de la HTML5 Drag API, lo que le da
soporte nativo en touch con un único `PointerSensor`. El bundle es ligero (~11 KB
comprimido). Se integra limpiamente con cualquier layout CSS existente, incluyendo
nuestro grid actual.

### Instalación requerida

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Tres paquetes del mismo ecosistema: `core` provee el contexto y los sensores,
`sortable` provee el preset de lista/grid ordenable, `utilities` provee helpers
de transformación CSS.

---

## 2. Flujo de interacción admin

### Opciones evaluadas

**Opción A — Handles siempre visibles para admin**: los íconos de drag aparecen
permanentemente en cada card cuando el usuario es admin. Sin toggle, sin estado
extra. Problema: en el grid actual, las cards ya tienen botones de editar y
borrar (`card-admin-actions`). Agregar un tercer control permanente satura
visualmente el espacio. Además, el admin puede querer navegar y ver la galería
"limpia" sin modos de edición activos.

**Opción B — Botón "Reordenar" que activa el modo drag**: un botón en la barra
de filtros activa/desactiva el modo reordenamiento. Cuando está activo, las cards
muestran el handle de drag y deshabilitan el `onClick` que abre el modal (evitar
conflicto entre drag e intención de abrir). Cuando está inactivo, la galería es
idéntica para admin y visitantes.

**Opción C — Drag automático en cualquier momento**: el admin puede arrastrar
cualquier card en todo momento sin activar ningún modo. Problema crítico: en
`ModelCard.tsx` el `card-viewer` y `card-info` tienen `onClick` para abrir el
modal. Un intento de drag de corta distancia se confundiría con un click,
produciendo que el modal se abra accidentalmente. Requiere lógica de umbral de
distancia que complica la implementación.

### Recomendación: Opción B

El botón de toggle es la solución más simple que resuelve todos los casos de uso:

- Admin en modo normal: galería idéntica a visitantes, sin ruido visual.
- Admin activa modo reordenar: handles visibles, clicks deshabilitados, UX clara.
- Estado en `Gallery.tsx`: un único `useState<boolean>` (`reorderMode`).
- El botón aparece solo si `isAdmin === true` — ningún cambio afecta a
  visitantes o estudiantes.

```tsx
// Adición mínima al estado de Gallery.tsx
const [reorderMode, setReorderMode] = useState(false);
```

El botón se ubica en la barra de filtros junto al botón existente "+ Subir Modelo",
usando la misma clase `filter-btn` para consistencia visual.

---

## 3. Persistencia del orden en Supabase

### El problema con `created_at`

La query actual ordena por `created_at DESC`. Para soportar un orden personalizado
se necesita una columna numérica en la tabla `models`. La solución estándar es
una columna `sort_order INTEGER` con valores tipo 1000, 2000, 3000 (gaps de 1000
para permitir inserciones sin renumerar toda la tabla).

### Opciones de guardado

**Tiempo real (en cada drop)**: cada vez que el admin suelta una card en su nueva
posición, se dispara un UPDATE a Supabase. Pros: el orden persiste inmediatamente,
sin riesgo de perder trabajo. Contras: si el admin reordena rápido, cada drag
genera una query. Con 20-30 modelos, el peor caso son N UPDATEs por sesión de
reordenamiento.

**Botón "Guardar orden"**: el admin arrastra todas las cards que quiere, ve el
resultado, y presiona "Guardar". Se ejecuta un solo batch de UPDATEs al confirmar.
Pros: una sola operación de escritura, el admin puede explorar sin consecuencias.
Contras: si cierra el tab o la sesión expira, pierde el trabajo.

### Recomendación: guardado en cada drop, con update optimista

Para un admin que gestiona 20-50 modelos, el número de drops por sesión de
reordenamiento es bajo (raramente más de 10). Guardar en cada drop da la
percepción de que "ya está guardado" sin botón extra.

Implementación: update optimista en estado local primero, luego UPDATE en Supabase.
Si el UPDATE falla, revertir el estado local con `setModels(prevOrder)`.

```ts
// Pseudo-código del handler onDragEnd
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  // 1. Calcular nuevo orden local
  const oldIndex = models.findIndex(m => m.id === active.id);
  const newIndex = models.findIndex(m => m.id === over.id);
  const reordered = arrayMove(models, oldIndex, newIndex);

  // 2. Update optimista inmediato
  setModels(reordered);

  // 3. Persistir en Supabase (batch de UPDATEs)
  const updates = reordered.map((m, i) => ({ id: m.id, sort_order: (i + 1) * 1000 }));
  for (const u of updates) {
    await supabase.from('models').update({ sort_order: u.sort_order }).eq('id', u.id);
  }
};
```

Para una galería de hasta 50 modelos, el loop de UPDATEs individuales es
aceptable. Si en el futuro escala a cientos de modelos, se migra a un RPC de
Supabase con `unnest` para un solo round-trip.

---

## 4. Compatibilidad con filtros por categoría

### El problema

`filteredModels` es un `useMemo` derivado de `models` filtrado por `activeFilter`.
Si el admin está en la vista "Personaje" y reordena, `onDragEnd` recibe índices
relativos a `filteredModels`, no a `models`. Un `arrayMove` directo sobre
`models` usaría índices incorrectos.

### Opciones

**Orden global único**: `sort_order` define el orden de todos los modelos
independientemente de la categoría. Reordenar en "Personaje" mueve elementos
en el orden global, lo que puede producir resultados contraintuitivos (el modelo
movido al primer lugar en "Personaje" puede quedar en posición 3 global si hay
otros modelos de otras categorías antes).

**Orden por categoría**: columna `sort_order` que solo tiene sentido dentro de
su categoría. Reordenar en "Personaje" afecta solo el orden de personajes;
la vista "Todos" muestra los modelos ordenados por categoría primero, luego por
`sort_order` dentro de cada grupo.

**Reordenamiento solo en vista "Todos"**: el modo reordenamiento se deshabilita
cuando hay un filtro activo que no sea "all". Solución más simple.

### Recomendación: reordenamiento solo en vista "Todos"

Esta es la estrategia más simple que resuelve el caso de uso real. El admin
raramente necesita ordenar "los personajes entre sí" de forma independiente al
orden global. Lo que necesita es controlar qué aparece primero en la galería
principal, que es la vista "Todos".

Implementación: cuando `reorderMode` es `true` y `activeFilter !== 'all'`,
mostrar un aviso inline: "El reordenamiento solo está disponible en la vista
'Todos'." y deshabilitar el modo drag en las cards.

Esto evita el bug de índices cruzados entre `filteredModels` y `models` sin
ninguna lógica adicional de mapeo de índices.

---

## 5. Migración de base de datos requerida

Para soportar `sort_order` es necesaria una migración en Supabase:

```sql
-- Agregar columna sort_order a la tabla models
ALTER TABLE models ADD COLUMN sort_order INTEGER;

-- Poblar sort_order inicial basado en created_at
UPDATE models
SET sort_order = sub.row_num * 1000
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS row_num
  FROM models
) sub
WHERE models.id = sub.id;

-- Asegurar que sea NOT NULL después de la migración inicial
ALTER TABLE models ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE models ALTER COLUMN sort_order SET DEFAULT 0;
```

La query en `loadModels` cambia de:
```ts
supabase.from('models').select('*').order('created_at', { ascending: false })
```
a:
```ts
supabase.from('models').select('*').order('sort_order', { ascending: true })
```

RLS: los UPDATEs de `sort_order` deben estar permitidos solo para el rol `admin`.
Verificar que la política RLS de UPDATE en `models` cubre este campo (si la
política actual permite al owner editar su propio modelo, debe añadirse una
condición adicional para que solo admins puedan editar `sort_order` de cualquier
modelo).

---

## 6. Lista de archivos a crear/modificar

### Nuevos archivos

| Archivo | Descripción |
|---|---|
| `src/components/SortableModelCard.tsx` | Wrapper de `ModelCard` con `useSortable` de dnd-kit. Recibe los mismos props más `isDragMode: boolean`. Cuando `isDragMode=false` renderiza `ModelCard` directamente sin overhead. |

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/Gallery.tsx` | Agregar `DndContext`, `SortableContext`, estado `reorderMode`, handler `onDragEnd`, botón toggle en filtros. Cambiar `filteredModels.map(...)` para usar `SortableModelCard` en lugar de `ModelCard`. |
| `src/lib/supabase.ts` | Agregar `sort_order: number` a la interfaz `ModelRow`. Agregar función utilitaria `updateModelOrder(updates: {id: string, sort_order: number}[])` para encapsular el batch de UPDATEs. |
| `src/styles/global.css` (o equivalente) | Agregar estilos para el handle de drag (icono de 6 puntos), estado activo de la card durante el drag (`opacity: 0.5`, `cursor: grabbing`), y el botón "Reordenar" en la barra de filtros. |

### Supabase (Dashboard o migración SQL)

| Acción | Descripción |
|---|---|
| Migration SQL | `ALTER TABLE models ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0` + UPDATE inicial |
| RLS policy | Verificar y ajustar la política UPDATE de `models` para que solo admins puedan modificar `sort_order` en modelos ajenos |

---

## 7. Estimación de esfuerzo

| Tarea | Complejidad | Estimado |
|---|---|---|
| Migración Supabase + RLS | Baja | 30 min |
| Instalar dnd-kit, crear `SortableModelCard.tsx` | Baja | 45 min |
| Modificar `Gallery.tsx` (DndContext + handler) | Media | 1.5 h |
| CSS para handle y modo drag | Baja | 30 min |
| Pruebas manuales (desktop + touch) | Media | 1 h |
| **Total estimado** | | **~4 h** |

---

## 8. Riesgos identificados

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Conflicto click/drag en `model-viewer` (el viewer tiene pointer events propios) | Media | `SortableModelCard` deshabilita `pointerEvents` en el viewer durante `dragMode` activo |
| RLS mal configurada permite que un estudiante sobrescriba `sort_order` | Media | Revisar política antes de merge |
| `sort_order = 0` en modelos recién subidos rompe el orden | Baja | `DEFAULT` en la columna = último lugar; `onUpload` asigna `sort_order = MAX(sort_order) + 1000` |
| Pérdida de UPDATEs si el admin cierra el tab durante el loop de guardado | Baja | Mostrar spinner durante el guardado; no crítico en UX de clase |

---

## Conclusión

La ruta de menor riesgo y mayor compatibilidad es:

1. `@dnd-kit/core` + `@dnd-kit/sortable` — única librería compatible con React 19 y touch.
2. Botón toggle "Reordenar" en la barra de filtros — mínima fricción, sin impacto en visitantes.
3. Guardado optimista en cada drop — percepción de persistencia inmediata, sin botón extra.
4. Reordenamiento solo en vista "Todos" — evita complejidad de índices cruzados con filtros.
5. Columna `sort_order INTEGER` en `models` — cambio de schema pequeño y reversible.

El alcance real es: 1 componente nuevo, 2 archivos modificados, 1 migración SQL.
Sin refactorizaciones adicionales, sin cambios en el schema de autenticación,
sin impacto en el flujo de likes/comentarios.

---

*Informe generado por Sebastián Torres Mejía — Senior Dev Astro/React*
*Revisión pendiente por Claude Renard (Tech Lead) antes de aprobación de implementación*
