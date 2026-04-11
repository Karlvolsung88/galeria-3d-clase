---
autor: Isabella Moreno Rios
cargo: Disenadora Frontend 3D
fecha: 2026-04-10
tema: Impacto en model-viewer y SVG segun arquitectura
estado: revision
---

# Impacto en model-viewer y SVG segun arquitectura de navegacion

## 1. Como se integra model-viewer con React actualmente

### ModelCard.tsx y ModelModal.tsx

Ambos componentes usan `<model-viewer>` como **custom element directo en JSX**, sin wrapper ni ref. Se emplea `{/* @ts-ignore */}` para suprimir el error de TypeScript al no estar tipado como elemento React. Los atributos se pasan como props HTML estilizados en JSX (camera-orbit, shadow-intensity, etc.), y el estilo se aplica via objeto inline de React.

No existe ningun mecanismo de:
- Verificacion de que el custom element `model-viewer` esta registrado antes de renderizar.
- Re-inicializacion o re-conexion al DOM despues de navegacion.
- Manejo de errores si el script de model-viewer no ha cargado aun.

### Carga del script (Layout.astro)

El script se carga en el `<head>` del layout con:

```html
<script type="module" async src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
```

Observaciones criticas:
- El atributo `async` permite que el navegador descargue sin bloquear el parser, pero **no garantiza que el custom element este registrado cuando React hidrata las islas**.
- En una carga inicial completa (full page load), el script generalmente termina antes o durante la hidratacion de React, por lo que funciona.
- En navegaciones subsecuentes (si se usara client-side routing), este `<script>` no se re-ejecutaria porque el `<head>` no se recarga.

---

## 2. Analisis de HexagonChart

### Arquitectura

HexagonChart es **SVG puro en React**. No usa canvas, WebGL, ni ninguna API del DOM. Todo se calcula con funciones matematicas puras (seno, coseno) y se renderiza como elementos SVG declarativos: `<polygon>`, `<circle>`, `<line>`, `<text>`.

### Dependencias

- **Datos**: recibe `skills` como props. Los datos vienen de Supabase via el componente padre `StudentCard`.
- **DOM**: cero dependencia. No usa `useEffect`, `useRef`, `useLayoutEffect`, ni `document.*`.
- **CSS**: solo tiene un `transition: all 0.4s ease` inline en el poligono de datos.

### Conclusion sobre HexagonChart

Este componente **no deberia tener problemas de renderizado en ninguna arquitectura** (MPA, SPA, View Transitions). Es React puro + SVG declarativo. Si no renderiza despues de una navegacion, el problema no esta en el componente en si, sino en:
1. La isla de React no se esta hidratando/montando.
2. Los datos de Supabase no estan llegando al componente.
3. El componente padre (`EstudiantesPage`) no se esta montando correctamente.

---

## 3. Requisitos para que model-viewer funcione correctamente

### 3.1 Registro del custom element

`model-viewer` se auto-registra con `customElements.define('model-viewer', ...)` cuando su script se ejecuta. Una vez registrado en el `CustomElementRegistry` del navegador, **persiste durante toda la vida de la pagina** (mismo document). No necesita re-registro.

Sin embargo:
- Si la navegacion crea un **nuevo document** (full page navigation en MPA), el registro se pierde y el script debe ejecutarse de nuevo.
- Si la navegacion mantiene el **mismo document** (SPA, View Transitions con morph), el registro persiste.

### 3.2 Race conditions identificadas

Existe una race condition potencial entre:

1. **El script de model-viewer** (async, modular, descarga ~200KB)
2. **La hidratacion de React** (client:load = inmediata)

Si React monta el JSX con `<model-viewer>` antes de que el script registre el custom element:
- El navegador crea un `HTMLUnknownElement` generico.
- Cuando el script finalmente registra el custom element, el navegador **automaticamente promueve** (upgrades) los elementos existentes al custom element.
- Esto funciona gracias al mecanismo de **Custom Element Upgrade** de la especificacion Web Components.

Por lo tanto: **en la carga inicial, la race condition no deberia causar problemas visibles**, gracias al upgrade automatico. El modelo aparecera cuando el script termine de cargar.

### 3.3 El problema real: navegaciones MPA subsecuentes

En Astro MPA (sin View Transitions), cada click en un link de navegacion (Galeria <-> Estudiantes) genera un **full page load**. Esto significa:
- Se descarga un nuevo HTML completo.
- Se ejecuta de nuevo el `<head>` incluyendo el script de model-viewer.
- Se crea un nuevo document con un nuevo CustomElementRegistry.
- React se hidrata de nuevo.

En teoria, esto deberia funcionar igual que la carga inicial. **Si model-viewer no renderiza despues de navegar, el problema probablemente no es de model-viewer en si, sino de la hidratacion de la isla React o del fetch de datos.**

---

## 4. Comportamiento MPA vs SPA vs View Transitions

### 4.1 MPA puro (configuracion actual)

| Aspecto | Comportamiento |
|---------|---------------|
| Navegacion | Full page load, nuevo document |
| Script model-viewer | Se re-descarga (pero cacheado por el browser) y re-ejecuta |
| Custom element | Se re-registra en cada pagina |
| React islands | Se re-hidratan completamente |
| HexagonChart | Se re-monta como nuevo componente |
| WebGL contexts | Se destruyen y recrean por completo |

**Ventaja**: estado limpio en cada pagina, no hay memory leaks de WebGL.
**Desventaja**: tiempo de carga mayor (script + hidratacion + fetch datos).

### 4.2 SPA (React Router hipotetico)

| Aspecto | Comportamiento |
|---------|---------------|
| Navegacion | Solo cambia el contenido del DOM, mismo document |
| Script model-viewer | Se carga una vez, persiste |
| Custom element | Se registra una vez, persiste |
| React | Re-render normal, no re-hidratacion |
| HexagonChart | Re-render normal |
| WebGL contexts | Se acumulan si no se limpian (PELIGROSO) |

**Ventaja**: navegacion rapida, sin re-carga de scripts.
**Desventaja**: acumulacion de contextos WebGL. model-viewer crea un contexto WebGL por instancia. Sin limpieza explicita, se puede alcanzar el limite del navegador (tipicamente 8-16 contextos simultaneos). Esto causaria que los nuevos model-viewer aparezcan como cajas negras.

### 4.3 Astro View Transitions

| Aspecto | Comportamiento |
|---------|---------------|
| Navegacion | Fetch del nuevo HTML + swap del DOM, mismo document |
| Script model-viewer | Se carga una vez, persiste (mismo document) |
| Custom element | Se registra una vez, persiste |
| React islands | Se destruyen y re-montan en el nuevo DOM |
| HexagonChart | Se remonta como nuevo |
| WebGL contexts | Depende de como View Transitions maneje el swap |

**Riesgo critico con View Transitions**: cuando Astro hace swap del DOM, los elementos `<model-viewer>` existentes se removidos del DOM. Esto deberia triggear `disconnectedCallback()` en el custom element, que a su vez deberia liberar el contexto WebGL. Cuando los nuevos elementos se insertan, `connectedCallback()` deberia inicializar nuevos contextos.

Pero: si el swap no es limpio (por ejemplo, si usa morph en lugar de replace), pueden quedar contextos WebGL huerfanos.

---

## 5. Diagnostico del problema reportado

El problema reportado es: "Al navegar entre paginas, model-viewer y HexagonChart no renderizan. Solo con hard reload."

### Hipotesis descartadas

- **HexagonChart tiene bug de renderizado**: descartado. Es SVG puro sin dependencias DOM.
- **model-viewer necesita re-registro**: en MPA puro (config actual), se re-registra automaticamente en cada full page load.

### Hipotesis probables

1. **Las islas React no se estan hidratando** despues de la navegacion. Si `client:load` no se esta ejecutando en la segunda pagina, ningun componente React renderiza -- ni model-viewer, ni HexagonChart.

2. **El fetch de datos de Supabase esta fallando silenciosamente** en la segunda pagina, dejando los componentes sin datos (vacio = no visible).

3. **Cache del browser** esta sirviendo una version parcial del HTML donde las islas no tienen el markup correcto para hidratar.

4. **Si se ha habilitado View Transitions** (no detectado en el codigo actual, pero podria estar en una rama o configuracion no commiteada): el swap del DOM no esta re-montando las islas correctamente.

### Nota importante

He verificado que la configuracion actual **NO usa View Transitions** (`astro.config.mjs` no tiene `experimental.viewTransitions` ni se importa `<ViewTransitions />` en el layout). Astro opera como MPA puro. Esto significa que cada navegacion es un full page load, y el comportamiento deberia ser identico a la carga inicial.

---

## 6. Recomendaciones de arquitectura

### Para model-viewer

1. **Mantener MPA puro** como la opcion mas segura. Cada full page load garantiza un estado limpio de WebGL sin leaks.

2. **Si se migra a View Transitions**: implementar limpieza explicita de contextos WebGL antes del swap. Escuchar el evento `astro:before-swap` para destruir instancias de model-viewer.

3. **Si se migra a SPA**: implementar un pool de contextos WebGL o un componente wrapper que maneje el ciclo de vida (mount/unmount) del model-viewer, liberando contextos al desmontar.

4. **En cualquier caso**: agregar un `customElements.whenDefined('model-viewer')` antes de renderizar, para evitar el flash de contenido no-definido.

### Para HexagonChart

1. **No requiere cambios de arquitectura**. Funciona en MPA, SPA y View Transitions sin modificacion.

2. **Si no renderiza, el problema esta arriba** en la cadena: isla no hidratada o datos no disponibles.

### Recomendacion general

La arquitectura **MPA pura + React islands (actual)** es la mas compatible con model-viewer y SVG. El problema reportado NO es inherente a esta arquitectura. Se debe investigar por que las islas React no se montan despues de la navegacion, no cambiar la arquitectura de navegacion.

---

## 7. Resumen ejecutivo

| Componente | Tipo | Dependencia DOM | Problema con navegacion | Riesgo |
|-----------|------|-----------------|------------------------|--------|
| model-viewer | Custom Element + WebGL | Alta (script externo + WebGL context) | Bajo en MPA, alto en SPA/VT | Memory leak de WebGL en SPA |
| HexagonChart | SVG puro en React | Ninguna | Ninguno propio | Cero |
| React Islands | Hydration | Requiere client:load | Si no hidratan, nada renderiza | ESTE es el sospechoso principal |

**Conclusion**: El foco de la investigacion debe estar en la hidratacion de las islas React y la disponibilidad de datos de Supabase, no en model-viewer ni HexagonChart en si mismos.
