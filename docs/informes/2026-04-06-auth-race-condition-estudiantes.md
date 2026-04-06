---
autor: Diego Ramírez Castellanos
cargo: Especialista Seguridad / Supabase
fecha: 2026-04-06
tema: Race condition auth — loading infinito en /estudiantes para admin logueado
estado: revision
---

## Diagnóstico

### Causa raíz confirmada

`fetchAllStudentsWithSkills()` es una promesa que **nunca resuelve ni rechaza** cuando hay sesión activa. No hay error en consola porque la promesa no falla — simplemente queda en cola indefinidamente.

**Mecanismo**: Supabase JS v2 refresca el token automáticamente al inicializar el cliente cuando hay sesión en localStorage. Durante ese refresh, las queries autenticadas se encolan. Si `loadData()` se lanza antes de que el refresh complete, la query queda esperando sin timeout.

**Por qué solo falla con sesión activa**: Sin sesión, el cliente usa anonKey directamente, sin refresh. Las queries se ejecutan de inmediato.

### Orden de ejecución problemático (EstudiantesPage.tsx:35-44)

```
1. loadProfile()      — se lanza, await interno a getSession()
2. loadData()         — se lanza inmediatamente, query queda en cola del refresh
3. onAuthStateChange  — se registra DESPUÉS de los lanzamientos
4. Token refresh      — puede completar o no completar a tiempo
5. Si no completa    → loadData() queda suspendida indefinidamente
```

### Por qué `setLoading(false)` nunca corre

`setLoading(false)` está en el bloque `finally`. Un `finally` solo corre cuando la promesa resuelve O rechaza. Si la promesa queda suspendida (ni resuelve ni rechaza), `finally` nunca corre.

---
autor: Sebastián Torres Mejía
cargo: Senior Dev Astro/React
fecha: 2026-04-06
tema: Solución — ordering del useEffect en EstudiantesPage
estado: revision
---

## Solución propuesta

### Principio

Registrar el listener de `onAuthStateChange` **antes** de lanzar `loadData()`. En Supabase v2, registrar el listener hace que el cliente complete su inicialización interna (incluido el token refresh) antes de continuar. Agregar `isMounted` para evitar memory leaks si el componente se desmonta.

### Cambio exacto — EstudiantesPage.tsx useEffect

```typescript
useEffect(() => {
  let isMounted = true;

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!isMounted) return;
    if (session) {
      const p = await getUserProfile();
      if (isMounted) setProfile(p);
    } else {
      if (isMounted) setProfile(null);
    }
  };

  const loadDataSafe = async () => {
    try {
      const data = await fetchAllStudentsWithSkills();
      if (isMounted) setStudents(data);
    } catch (err) {
      console.error('Error loading students:', err);
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  // CRÍTICO: registrar listener ANTES de loadData
  // Esto completa la inicialización de auth en Supabase v2
  const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
    loadProfile();
  });

  // Con auth inicializado, las queries ya no quedan en cola
  loadProfile();
  loadDataSafe();

  return () => {
    isMounted = false;
    subscription.unsubscribe();
  };
}, []);
```

### Cambios respecto al código actual

1. `onAuthStateChange` se registra ANTES de `loadProfile()` y `loadData()`
2. Se agrega `isMounted` flag para evitar setState en componente desmontado
3. Funciones locales dentro del useEffect (mismo patrón, mejor scope)

### Riesgo residual

Si las políticas RLS de Supabase bloquean la query para el admin, esta solución no será suficiente. En ese caso, el error aparecería en consola (Supabase retorna error en lugar de colgar). Como NO hay error en consola, el problema es el race condition, no RLS.
