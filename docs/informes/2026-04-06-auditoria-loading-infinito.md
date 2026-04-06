---
autor: Sebastián Torres Mejía
cargo: Senior Dev Astro/React
fecha: 2026-04-06
tema: Auditoría — Loading infinito en /estudiantes y /perfil
estado: revision
---

## Resumen ejecutivo

El spinner infinito en `/estudiantes` tiene una causa raíz directa y concreta.
No es un problema de ClientRouter ni de Supabase. Es un patrón roto en todos
los componentes: funciones `async` sin `try/catch` donde si la petición falla,
`setLoading(false)` nunca se ejecuta. El componente queda atrapado.

---

## Causa raíz — CRÍTICA

### EstudiantesPage.tsx líneas 19-23

```javascript
const loadData = async () => {
  const data = await fetchAllStudentsWithSkills(); // si lanza error →
  setStudents(data);
  setLoading(false); // ← NUNCA SE EJECUTA si la línea anterior falla
};
```

**Patrón roto**: ningún `try/catch`. Si Supabase devuelve error, rate-limit,
timeout o la RLS bloquea la consulta, la promesa se rechaza y `setLoading(false)`
nunca corre. El componente queda en estado `loading: true` para siempre.

**Mismo patrón roto en:**
- `Gallery.tsx` líneas 72-79 — `Promise.all()` sin catch, `setLoading(false)` nunca corre si falla
- `ProfilePage.tsx` líneas 27-43 — `load()` async sin try/catch

---

## Problemas secundarios

### StudentCard.tsx líneas 49-51 — Mutación directa de prop

```javascript
if (ok) {
  student.artstation_url = artstation || null; // MUTACIÓN DIRECTA
  student.instagram_url = instagram || null;   // MUTACIÓN DIRECTA
```

React no detecta este cambio. El componente padre no se re-renderiza.
Los links se guardan en Supabase pero la UI no los muestra hasta recargar.

### supabase.ts línea 53 — `getUserProfile()` retorna `undefined`

`.single()` retorna `undefined` si no hay fila. Los componentes chequean
`if (!profile)` y `undefined` pasa el check incorrectamente.

```javascript
return data; // puede ser undefined, no null
```

---

## Fixes requeridos (en orden de prioridad)

| # | Archivo | Línea | Fix |
|---|---------|-------|-----|
| 1 | `EstudiantesPage.tsx` | 19-23 | Agregar `try/catch/finally` — `setLoading(false)` en `finally` |
| 2 | `Gallery.tsx` | 72-79 | Agregar `try/catch/finally` — `setLoading(false)` en `finally` |
| 3 | `ProfilePage.tsx` | 27-43 | Agregar `try/catch/finally` — `setLoading(false)` en `finally` |
| 4 | `StudentCard.tsx` | 49-51 | Eliminar mutación directa — usar callbacks del padre para refrescar |
| 5 | `supabase.ts` | 53 | Retornar `data ?? null` en lugar de `data` |
