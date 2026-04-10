---
autor: Isabella Moreno Ríos
cargo: Diseñadora Frontend 3D
fecha: 2026-04-10
tema: UX/UI del drag-and-drop para reordenamiento de modelos (admin)
estado: revision
---

# UX/UI del Drag-and-Drop para Reordenamiento de Modelos (Admin)

## Contexto de análisis

Revisé `ModelCard.tsx` y `Gallery.tsx` antes de proponer cualquier solución.

Puntos clave que condicionan el diseño:

- La card tiene `.card-admin-actions` en la **esquina superior derecha** con dos botones: editar (lápiz) y eliminar (papelera). Ambos son `position: absolute` dentro de `.card`.
- El `card-viewer` ocupa la parte superior con `model-viewer` — zona interactiva de 3D.
- El `card-info` en la zona inferior contiene título, categoría, estudiante, tags, likes y comentarios.
- El `canEdit` gate ya está implementado: solo el admin ve los controles de edición. El mismo gate se usará para el handle de drag.
- El grid es `filteredModels.map()` sin keys de posición — implementar drag implica agregar un campo `sort_order` en Supabase y reordenar el array local con estado optimista.

---

## 1. Handle de drag — decisión y justificación

### Opciones evaluadas

**A) Esquina superior izquierda (ícono de 6 puntos)**
- Opuesta a `.card-admin-actions` (esquina superior derecha) — equilibrio visual natural.
- No colisiona con el área de clic del `card-viewer`.
- Es la convención establecida en Notion, Trello, Linear y Figma para drag handles.
- El ícono de 6 puntos (grid dots / dragabbles) es reconocible universalmente como "agarrable".

**B) Barra superior completa como zona de arrastre**
- Problemático: el `card-viewer` tiene `onClick` que abre el modal. Toda la zona superior ya tiene semántica de clic. Convertirla también en drag handle crea conflicto de intención (¿click o drag?).
- Rompe la experiencia para visitantes si se activa por error.

**C) Ícono flotante superpuesto al model-viewer**
- Se superpone al contenido 3D, oscurece el modelo.
- En modo hover podría confundirse con los controles de `model-viewer`.

### Decisión: Opción A — ícono de 6 puntos en esquina superior izquierda

El handle va en `.card`, `position: absolute`, `top: 8px; left: 8px`, visible solo cuando `canEdit === true`. Es la solución que:
1. No rompe el flujo de clic del viewer.
2. No compite con `.card-admin-actions`.
3. Comunica "arrastrá desde aquí" con semántica visual establecida.
4. Se oculta completamente para visitantes — zero UX debt para el flujo de lectura.

---

## 2. Estado visual durante el drag

### Card mientras se arrastra (`.card.dragging`)

La card original debe "desaparecer" del grid para que el usuario sienta que la está moviendo. No desaparece del DOM (necesita el placeholder), pero se vuelve transparente y pierde su borde de color para indicar que está "en el aire".

```css
.card.dragging {
  opacity: 0.35;
  transform: scale(0.97);
  border-color: var(--border);
  box-shadow: none;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
```

La copia "fantasma" que sigue al cursor (el `dragImage` nativo o el ghost de la librería) debería tener:

```css
/* Para librerías como dnd-kit — el drag overlay */
.drag-overlay-card {
  opacity: 0.92;
  transform: rotate(1.5deg) scale(1.04);
  box-shadow:
    0 0 0 2px var(--accent),
    0 16px 48px rgba(0, 229, 255, 0.25),
    8px 8px 0 rgba(0, 0, 0, 0.6);
  border-color: var(--accent);
  cursor: grabbing;
}
```

El rotate de `1.5deg` es característico del neubrutalism: transmite "físicamente levantado", sin ser exagerado. El glow en `--accent` (#00e5ff) indica acción activa.

### Placeholder / drop target (`.card.drag-over`)

El hueco donde va a caer la card debe ser visible pero no agresivo. Propongo un borde punteado con el color de acento y fondo levemente iluminado:

```css
.card.drag-over {
  background: rgba(0, 229, 255, 0.04);
  border: 2px dashed var(--accent);
  box-shadow: inset 0 0 24px rgba(0, 229, 255, 0.08);
  /* El contenido interno queda en opacity 0 — solo el hueco */
}

.card.drag-over > * {
  opacity: 0;
}
```

El fondo en `rgba(0, 229, 255, 0.04)` es casi imperceptible en `--bg: #080a0e`, pero confirma la zona de drop sin romper el contraste del grid.

### Animación de desplazamiento de otras cards

Las cards vecinas que se desplazan para "abrir espacio" deben animarse suavemente. Con dnd-kit esto se maneja via `CSS transition` en el grid:

```css
.gallery-grid {
  /* Agregar a lo existente: */
  --grid-transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
}

/* dnd-kit aplica transform inline durante el sort */
.card {
  transition: var(--grid-transition, none);
}
```

`cubic-bezier(0.2, 0, 0, 1)` es la curva de "ease-out rápido" — las cards se mueven con decisión, no con el float suave que se siente genérico.

---

## 3. Indicador de modo reordenamiento

### Problema de diseño

El admin abre la galería y ve las cards. No hay señal de que puede reordenarlas. El handle de 6 puntos no es suficiente por sí solo — el admin necesita "descubrir" la funcionalidad.

### Solución: pista pasiva + activación explícita

Propongo dos capas:

**Capa 1 — Pista pasiva (siempre visible para admin)**

El handle de 6 puntos se muestra en cada card con `opacity: 0.4` por defecto, y sube a `opacity: 1` en hover. Esto comunica que las cards son reordenables sin interrumpir el flujo.

```css
.drag-handle {
  opacity: 0.4;
  transition: opacity 0.2s ease;
}

.card:hover .drag-handle {
  opacity: 1;
}
```

**Capa 2 — Badge en el header de la galería (solo admin)**

Un label sutil debajo del counter, junto al indicador de refreshing existente:

```jsx
{isAdmin && (
  <span className="admin-reorder-hint">
    ⠿ arrastrá para reordenar
  </span>
)}
```

```css
.admin-reorder-hint {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
  user-select: none;
}
```

Visible pero no protagónico. Usa `var(--muted)` (#8b95a8) y texto en mayúsculas monoespaciado — el estilo de los labels de sistema que ya usa el proyecto (véase `.counter`).

---

## 4. Feedback de guardado

### Criterio de diseño

El reordenamiento es frecuente — el admin puede mover 5-6 cards en una sesión. Si cada drop muestra un toast modal o bloquea la UI, el flujo se vuelve frustrante. El feedback debe ser:

1. **No bloqueante** — el admin puede seguir arrastrando inmediatamente.
2. **No acumulativo** — no apilar 6 toasts por 6 drops.
3. **Localizado** — no necesita llamar la atención desde lejos.

### Solución: estado en el counter + flush de snackbar único

**Durante el drag/save en progreso:**

El counter existente (`XX MODELOS`) cambia temporalmente su color de borde al acento para indicar actividad:

```css
.counter.saving {
  border-color: var(--accent);
  color: var(--accent);
  transition: border-color 0.2s ease, color 0.2s ease;
}
```

**Post-save (2 segundos después del drop exitoso):**

El counter muestra un checkmark inline que desaparece solo:

```jsx
<span className="counter">
  {savedRecently ? (
    <>
      <svg width="12" height="12">/* checkmark */</svg>
      {' '}ORDEN GUARDADO
    </>
  ) : (
    `${String(filteredModels.length).padStart(2, '0')} MODELOS`
  )}
</span>
```

```css
.counter.saved {
  color: #22c55e; /* verde — único uso del verde en este contexto */
  border-color: #22c55e;
  transition: color 0.3s ease, border-color 0.3s ease;
}
```

El verde (#22c55e) ya está en el sistema (usado para la categoría "objeto") — no introduce un color nuevo.

**Para errores de red (save fallido):**

Un snackbar mínimo en la parte inferior de la pantalla, sin modal:

```css
.save-error-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface2);
  border: 2px solid var(--accent2); /* naranja = error */
  color: var(--text);
  padding: 10px 20px;
  font-size: 13px;
  font-family: var(--font-mono, monospace);
  z-index: 999;
  animation: toastIn 0.2s ease;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

El toast de error aparece solo en fallo de red — no por cada drop exitoso.

---

## 5. Mobile/touch — consideraciones para tablet del admin

El admin podría gestionar la galería desde un iPad o tablet Android. El drag-and-drop nativo en touch es inconsistente entre navegadores. Consideraciones:

**a) Usar librería con soporte touch explícito**

`@dnd-kit/core` + `@dnd-kit/sortable` tienen un `TouchSensor` con configuración de `activationConstraint`:

```js
const touchSensor = useSensor(TouchSensor, {
  activationConstraint: {
    delay: 200,       // ms de press-and-hold para activar drag
    tolerance: 8,     // px de movimiento permitido antes de activar
  },
});
```

El `delay: 200ms` es crítico: sin él, cualquier scroll vertical en la galería activa el drag por accidente. Con 200ms el usuario tiene que "sostener" la card para arrastrarla.

**b) Hacer el handle más grande en touch**

El handle de 6 puntos de 16x16px es pequeño para touch. En pantallas touch el hit area debe ser al menos 44x44px (WCAG 2.5.5):

```css
.drag-handle {
  width: 16px;
  height: 16px;
  /* Hit area extendido via padding sin agrandar el ícono visual */
  padding: 14px;
  margin: -14px;
  touch-action: none; /* Previene scroll mientras se arrastra */
}
```

**c) Feedback háptico (opcional, progresivo)**

En dispositivos que lo soportan:

```js
// Al iniciar drag
if ('vibrate' in navigator) {
  navigator.vibrate(50); // 50ms — confirmación leve
}
```

No es un requisito, pero mejora la percepción de "agarre" en tablets.

**d) No depender de hover para descubrir el handle**

En touch no hay hover. El handle debe tener `opacity: 0.7` como valor base (sin hover) para el admin, no `opacity: 0.4`. La pista de texto "arrastrá para reordenar" en el header se vuelve más importante en touch.

---

## 6. CSS concreto propuesto

Clases listas para copiar al CSS global del proyecto:

```css
/* ─── DRAG HANDLE ─────────────────────────────────────────── */

.drag-handle {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--muted);
  opacity: 0.4;
  cursor: grab;
  background: transparent;
  border: none;
  padding: 6px; /* hit area sin agrandar el ícono */
  transition: opacity 0.2s ease, color 0.2s ease;
  touch-action: none; /* crítico para touch drag */
  user-select: none;
}

.drag-handle:hover {
  opacity: 1;
  color: var(--accent);
}

.drag-handle:active {
  cursor: grabbing;
  color: var(--accent);
  opacity: 1;
}

/* SVG de 6 puntos (se pasa como children del botón) */
.drag-handle-icon {
  display: grid;
  grid-template-columns: repeat(2, 4px);
  gap: 3px;
  pointer-events: none;
}

.drag-handle-icon span {
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
}


/* ─── CARD DRAGGING (la original en el grid) ──────────────── */

.card.dragging {
  opacity: 0.35;
  transform: scale(0.97);
  border-color: var(--border) !important;
  box-shadow: none !important;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}


/* ─── DRAG OVERLAY (el fantasma que sigue al cursor) ─────── */
/* Se aplica al portal de dnd-kit — fuera del grid */

.drag-overlay-card {
  opacity: 0.92;
  transform: rotate(1.5deg) scale(1.04);
  border: 2px solid var(--accent);
  box-shadow:
    0 0 0 1px rgba(0, 229, 255, 0.3),
    0 16px 48px rgba(0, 229, 255, 0.2),
    8px 8px 0 rgba(0, 0, 0, 0.5);
  cursor: grabbing;
  pointer-events: none;
}


/* ─── DROP TARGET / PLACEHOLDER ──────────────────────────── */

.card.drag-over {
  background: rgba(0, 229, 255, 0.04);
  border: 2px dashed var(--accent) !important;
  box-shadow: inset 0 0 24px rgba(0, 229, 255, 0.06) !important;
}

.card.drag-over > * {
  opacity: 0;
  pointer-events: none;
}


/* ─── TRANSICIÓN DE CARDS VECINAS ────────────────────────── */

.gallery-grid .card {
  /* Agregar a la regla .card existente */
  transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
}

/* Durante drag global — el grid entra en modo reordenamiento */
.gallery-grid.is-dragging .card:not(.dragging):not(.drag-over) {
  transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
}


/* ─── COUNTER — ESTADOS DE GUARDADO ──────────────────────── */

.counter.saving {
  color: var(--accent);
  border-color: var(--accent);
  transition: color 0.2s ease, border-color 0.2s ease;
}

.counter.saved {
  color: #22c55e;
  border-color: #22c55e;
  transition: color 0.3s ease, border-color 0.3s ease;
}


/* ─── TOAST DE ERROR ─────────────────────────────────────── */

.save-error-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface2);
  border: 2px solid var(--accent2);
  color: var(--text);
  padding: 10px 20px;
  font-size: 13px;
  font-family: var(--font-mono, monospace);
  letter-spacing: 0.04em;
  z-index: 9999;
  white-space: nowrap;
  animation: toastSlideIn 0.2s ease;
}

@keyframes toastSlideIn {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}


/* ─── HINT REORDENAMIENTO EN HEADER (solo admin) ─────────── */

.admin-reorder-hint {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
  user-select: none;
}
```

---

## Resumen de decisiones

| Decisión | Opción elegida | Razón |
|----------|---------------|-------|
| Ubicación del handle | Esquina superior izquierda | Opuesta a edit/delete; no colisiona con viewer |
| Ícono del handle | 6 puntos (grid dots) | Convención universalmente reconocida para drag |
| Card dragging | `opacity: 0.35` + `scale(0.97)` | "Queda en el slot" mientras el ghost sigue al cursor |
| Ghost/overlay | `rotate(1.5deg)` + glow `--accent` | Neubrutalism: físicamente levantado |
| Placeholder | Borde punteado `--accent` + fondo `rgba(0,229,255,0.04)` | Visible sin distorsionar el grid |
| Feedback de guardado | Estado en `.counter` (inline, no modal) | No interrumpe flujo de reordenamiento |
| Error de red | Toast inferior en `--accent2` (naranja) | Solo aparece cuando hay fallo real |
| Touch activation | `delay: 200ms` en `TouchSensor` | Previene conflicto con scroll vertical |
| Hit area touch | `padding: 14px; margin: -14px` en handle | Área táctil 44px sin agrandar el ícono visual |

---

## Librería recomendada

`@dnd-kit/core` + `@dnd-kit/sortable` — es la que mejor se integra con React 19 y Astro. Alternativas como `react-beautiful-dnd` están en mantenimiento mínimo y tienen problemas conocidos con React 18+.

La implementación del estado `sort_order` en Supabase y la lógica de guardado optimista quedan fuera del alcance de este informe de diseño — corresponde a Sebastián Torres Mejía (Senior Dev) y Diego Ramírez Castellanos (Data Lead) definirlo en sprint de implementación.
