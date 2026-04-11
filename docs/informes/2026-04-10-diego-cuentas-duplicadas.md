---
autor: Diego Ramirez Castellanos
cargo: Data Lead & Arquitecto de Datos
fecha: 2026-04-10
tema: Auditoria cuentas duplicadas - Andrea Rozo y Johan Ospina
estado: revision
---

# Auditoria de Cuentas Duplicadas

## Resumen ejecutivo

Se identificaron **2 cuentas duplicadas** para Andrea Rozo y **2 cuentas duplicadas** para Johan Ospina. En ambos casos, la cuenta original (marzo 2026) contiene los datos importantes (modelos, skills, likes), mientras que la cuenta nueva (10 abril 2026) tiene poca o ninguna actividad relevante.

---

## 1. Andrea Rozo

### Cuenta A1 - ORIGINAL (conservar)
| Campo | Valor |
|-------|-------|
| **ID** | `f842335b-fa6f-4277-a1a5-732883e446ef` |
| **full_name** | Andrea Rozo |
| **role** | student |
| **created_at** | 2026-03-27 14:56:31 UTC |

### Cuenta A2 - DUPLICADA (eliminar)
| Campo | Valor |
|-------|-------|
| **ID** | `e9db4667-1de0-4834-8b64-f70ad3c248bb` |
| **full_name** | Andrea Rozo |
| **role** | student |
| **created_at** | 2026-04-10 14:52:40 UTC |

### Modelos asociados

| Modelo | Titulo | Categoria | Cuenta | Fecha |
|--------|--------|-----------|--------|-------|
| `cfa92190-8325-45e0-9396-f55f9676c40f` | Triceraptop 01 | objeto | A1 (original) | 2026-04-10 |
| `62001d05-5609-4f69-bb81-c32780ad60b0` | ak47 | objeto | A1 (original) | 2026-03-27 |

**Cuenta A2**: Sin modelos asociados.

### Likes
- **Cuenta A1**: 0 likes
- **Cuenta A2**: 0 likes

### Comments
- **Cuenta A1**: 0 comments
- **Cuenta A2**: 0 comments

### Student Skills
- **Cuenta A1**: 6 skills configurados (modelado_3d: 50, escultura: 10, uv_mapping: 10, texturizado_pbr: 60, optimizacion: 20, renderizado: 90)
- **Cuenta A2**: Sin skills

### Diagnostico Andrea Rozo
La cuenta A1 es claramente la principal: tiene los 2 modelos, las 6 skills configuradas. La cuenta A2 esta vacia y fue creada hoy (10 abril). **Recomendacion: eliminar A2, conservar A1.**

---

## 2. Johan Ospina

### Cuenta J1 - ORIGINAL (conservar)
| Campo | Valor |
|-------|-------|
| **ID** | `684c3fb0-68b0-49ad-8913-1a08871cc89b` |
| **full_name** | Johan Armando Ospina Bejarano |
| **role** | student |
| **created_at** | 2026-03-27 14:48:51 UTC |

### Cuenta J2 - DUPLICADA (evaluar)
| Campo | Valor |
|-------|-------|
| **ID** | `934866e5-eb10-4e28-9372-5b51c57dce18` |
| **full_name** | Johan Ospina |
| **role** | student |
| **created_at** | 2026-04-10 16:48:17 UTC |

### Modelos asociados

| Modelo | Titulo | Student field | Cuenta | Fecha |
|--------|--------|---------------|--------|-------|
| `7b5a0544-23b1-448f-9143-6ceb5f9a0983` | Jinx Model V1 Blocking | "Johan Ospina " (trailing space) | J1 (original) | 2026-03-27 |
| `f6030afe-6b0a-4a2a-bdea-35ee37e51579` | Pistola Jinx V2 | "JOHAN OSPINA" (mayusculas) | J2 (duplicada) | 2026-04-10 |

**ATENCION**: La cuenta J2 tiene 1 modelo subido hoy. Si se elimina J2, hay que migrar ese modelo a J1.

### Likes
- **Cuenta J1**: 3 likes dados a otros modelos
  - `18579597-2363-4100-b0dd-ee8b2f0116c9` (2026-03-27)
  - `2b147fa4-5b55-4205-8ff5-f917ff8bde3a` (2026-03-27)
  - `a76c0748-4153-4739-9df8-da3c0568827d` (2026-03-27)
- **Cuenta J2**: 0 likes

### Comments
- **Cuenta J1**: 0 comments
- **Cuenta J2**: 2 comments (ambos del 2026-04-10):
  - En modelo `cfa92190` (Triceraptop 01 de Andrea Rozo): "vaya mierda"
  - En modelo `dfb26bc5`: "al menos se intento no?"

**NOTA**: Los comentarios de J2 tienen contenido inapropiado. Considerar moderar antes de migrar.

### Student Skills
- **Cuenta J1**: 6 skills configurados (modelado_3d: 80, escultura: 10, uv_mapping: 70, texturizado_pbr: 60, optimizacion: 20, renderizado: 60)
- **Cuenta J2**: Sin skills

### Diagnostico Johan Ospina
La cuenta J1 tiene los skills, los likes, y el modelo original. La cuenta J2 tiene 1 modelo nuevo y 2 comentarios (con contenido inapropiado). **Recomendacion: migrar el modelo de J2 a J1 (actualizar user_id), evaluar los comentarios, luego eliminar J2.**

### Observacion adicional: inconsistencia en campo `student`
El campo `student` de los modelos de Johan tiene valores inconsistentes:
- J1: `"Johan Ospina "` (con espacio al final)
- J2: `"JOHAN OSPINA"` (todo mayusculas)

Se recomienda normalizar a `"Johan Armando Ospina Bejarano"` o `"Johan Ospina"` al unificar.

---

## 3. Plan de unificacion propuesto

### Paso 1: Migrar datos de cuentas duplicadas a originales

**Andrea Rozo** (A2 -> A1):
- No hay datos que migrar. A2 esta completamente vacia.

**Johan Ospina** (J2 -> J1):
```sql
-- Migrar modelo de J2 a J1
UPDATE models SET user_id = '684c3fb0-68b0-49ad-8913-1a08871cc89b'
WHERE id = 'f6030afe-6b0a-4a2a-bdea-35ee37e51579';

-- Evaluar comentarios antes de migrar (contenido inapropiado)
-- Opcion A: Migrar
UPDATE comments SET user_id = '684c3fb0-68b0-49ad-8913-1a08871cc89b'
WHERE user_id = '934866e5-eb10-4e28-9372-5b51c57dce18';

-- Opcion B: Eliminar comentarios inapropiados
DELETE FROM comments WHERE id IN (
  '8e167e7c-280d-4a6e-b8e5-8af382884d05',
  '1d882043-cefa-41c2-9254-fab43963fd71'
);
```

### Paso 2: Normalizar campo `student` en modelos de Johan
```sql
UPDATE models SET student = 'Johan Ospina'
WHERE user_id = '684c3fb0-68b0-49ad-8913-1a08871cc89b';
```

### Paso 3: Eliminar profiles duplicados
```sql
-- Solo DESPUES de migrar todos los datos
DELETE FROM profiles WHERE id = 'e9db4667-1de0-4834-8b64-f70ad3c248bb'; -- Andrea A2
DELETE FROM profiles WHERE id = '934866e5-eb10-4e28-9372-5b51c57dce18'; -- Johan J2
```

### Paso 4: Desactivar cuentas auth duplicadas
Desde el dashboard de Supabase Authentication:
- Desactivar o eliminar el usuario auth con id `e9db4667-1de0-4834-8b64-f70ad3c248bb`
- Desactivar o eliminar el usuario auth con id `934866e5-eb10-4e28-9372-5b51c57dce18`

---

## 4. Resumen de IDs para referencia rapida

| Estudiante | Cuenta a CONSERVAR | Cuenta a ELIMINAR |
|------------|-------------------|-------------------|
| Andrea Rozo | `f842335b-fa6f-4277-a1a5-732883e446ef` | `e9db4667-1de0-4834-8b64-f70ad3c248bb` |
| Johan Ospina | `684c3fb0-68b0-49ad-8913-1a08871cc89b` | `934866e5-eb10-4e28-9372-5b51c57dce18` |

---

*Informe generado por consulta directa a Supabase REST API (solo lectura). No se realizaron modificaciones.*
