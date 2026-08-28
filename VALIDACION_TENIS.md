# Validación Estricta de Tenis - Modal de Resultados

## Resumen de Implementación

Se implementó un sistema completo de validación de puntajes de tenis en el modal "Cargar/Editar Resultado" con las siguientes características principales:

### 1. Validación Estricta para Sets 1 y 2

**Restricciones implementadas:**
- ✅ Solo permite **un dígito** (maxLength={1})
- ✅ Rango permitido: **0 a 7**
- ✅ Tipo de input: `text` con inputMode="numeric" (mejor control que type="number")
- ✅ Validación en tiempo real que limita automáticamente el valor

**Puntajes válidos de tenis para sets normales:**
- `6-0`, `6-1`, `6-2`, `6-3`, `6-4` (victoria por 2+ games)
- `7-5` (victoria por 2 games en set extendido)
- `7-6` (victoria por tie-break regular)

**Puntajes inválidos rechazados:**
- ❌ `7-0`, `7-1`, `7-2`, `7-3`, `7-4` (no se puede ganar 7-X sin llegar a 5-5)
- ❌ `6-6`, `7-7` (empates no permitidos)
- ❌ `8-0` o mayor (fuera de rango de tenis)

### 2. Interfaz Dinámica para Set 3

**Selector de Formato:**
- Dos opciones excluyentes:
  - **"Tercer Set (6 games)"**: Set normal con las mismas reglas que Sets 1 y 2
  - **"Super Tie-Break (a 10 pts)"**: Desempate especial con reglas propias

**Comportamiento:**
- El Set 3 está **deshabilitado** hasta que se seleccione un formato
- Al cambiar de formato, los inputs del Set 3 se **limpian automáticamente**
- Validación específica según el formato elegido

### 3. Validación de Super Tie-Break

**Restricciones para Super Tie-Break:**
- ✅ Permite **dos dígitos** (maxLength={2})
- ✅ Rango permitido: **0 a 25**
- ✅ Validación de reglas de tie-break:
  - El ganador debe tener **10 o más puntos**
  - Si el ganador tiene exactamente 10, el perdedor debe tener **8 o menos**
  - Si el ganador tiene más de 10, debe ganar por **exactamente 2 puntos**

**Ejemplos de puntajes válidos:**
- ✅ `10-0`, `10-1`, ..., `10-8` (victoria a 10 con ventaja)
- ✅ `11-9`, `12-10`, `13-11`, `14-12`, etc. (tie-breaks extendidos)

**Ejemplos de puntajes inválidos:**
- ❌ `10-9` (no es ventaja de 2)
- ❌ `9-7` (ganador no llegó a 10)
- ❌ `10-10` (empate no permitido)
- ❌ `11-8` (diferencia de 3, no de 2)

### 4. Prevención de Errores y Feedback Visual

**Validación en Tiempo Real:**
```typescript
// Set 1 y Set 2: maxLength={1}, max={7}
<input
  type="text"
  inputMode="numeric"
  maxLength={1}
  value={set.j1}
  onChange={(e) => handleCambiarSet(0, "j1", e.target.value)}
/>

// Set 3 con Super Tie-Break: maxLength={2}, max={25}
<input
  type="text"
  inputMode="numeric"
  maxLength={formatoSet3 === "full" ? 1 : 2}
  value={set3.j1}
  placeholder={formatoSet3 === "full" ? "0-7" : "0-25"}
/>
```

**Feedback Visual de Errores:**
- 🔴 Banner rojo con ícono de alerta mostrando errores específicos
- 🔴 Mensaje en rojo antes del botón "Guardar" cuando hay errores
- 🔴 Botón "Guardar resultado" deshabilitado si la validación falla

**Mensajes de Error Específicos:**
- "Set 1 tiene un puntaje inválido para tenis"
- "Set 2 tiene un puntaje inválido para tenis"
- "Set 3 tiene un puntaje inválido para un tercer set normal"
- "Set 3 tiene un puntaje inválido para Super Tie-Break"
- "Seleccioná el formato del Set 3"

### 5. Experiencia de Usuario Mejorada

**Ayuda Contextual:**
- Sección expandible "Ver puntajes válidos de tenis" con ejemplos
- Placeholders dinámicos según el formato seleccionado
- Labels claros: "(obligatorio)" para Sets 1 y 2, "(opcional)" para Set 3
- Badge "(Super TB)" en el Set 3 cuando se selecciona ese formato

**Resumen Dinámico:**
- Muestra el resultado final tal como se guardará: `6-4, 3-6, 10-3`
- Indica explícitamente cuando el Set 3 es Super Tie-Break
- Se actualiza en tiempo real mientras se cargan los datos

**Limpieza de Inputs:**
- Elimina automáticamente caracteres no numéricos
- Limita longitud según el formato
- Trunca valores que excedan el máximo permitido

## Funciones de Validación

### `esSetTenisValido(j1: string, j2: string): boolean`

Valida que un set normal cumpla las reglas de tenis:
- Puntajes entre 0 y 7
- No puede ser empate
- 6-X solo si X ≤ 4
- 7-X solo si X es 5 o 6

### `esSuperTieBreakValido(j1: string, j2: string): boolean`

Valida que un Super Tie-Break cumpla las reglas:
- Ganador tiene 10+ puntos
- Si ganador = 10, perdedor ≤ 8
- Si ganador > 10, diferencia = 2
- Máximo 25 puntos para casos extremos

### `detectarFormatoSet3Inicial(resultado: string | null): FormatoSet3`

Al editar un resultado existente, detecta automáticamente el formato:
- Si el tercer set tiene un valor ≥ 10, es Super Tie-Break
- Si el tercer set tiene valores < 10, es un set normal
- Si no hay tercer set, retorna null

## Arquitectura del Estado

```typescript
// Estado del formato del Set 3
const [formatoSet3, setFormatoSet3] = useState<FormatoSet3>(() =>
  detectarFormatoSet3Inicial(partido.resultado)
);

// Validación reactiva
const validacionSets = useMemo(() => {
  const errores: string[] = [];
  
  // Valida Set 1
  if (set1Completo && !esSetTenisValido(set1.j1, set1.j2)) {
    errores.push("Set 1 tiene un puntaje inválido para tenis");
  }
  
  // Valida Set 2
  if (set2Completo && !esSetTenisValido(set2.j1, set2.j2)) {
    errores.push("Set 2 tiene un puntaje inválido para tenis");
  }
  
  // Valida Set 3 según formato
  if (set3Completo) {
    if (!formatoSet3) {
      errores.push("Seleccioná el formato del Set 3");
    } else if (formatoSet3 === "full") {
      if (!esSetTenisValido(set3.j1, set3.j2)) {
        errores.push("Set 3 tiene un puntaje inválido para un tercer set normal");
      }
    } else if (formatoSet3 === "super_tb") {
      if (!esSuperTieBreakValido(set3.j1, set3.j2)) {
        errores.push("Set 3 tiene un puntaje inválido para Super Tie-Break");
      }
    }
  }
  
  return { errores, esValido: errores.length === 0 };
}, [setsResultado, formatoSet3]);

// Bloqueo de guardado
const puedeGuardar = esWalkover
  ? Boolean(ganadorId)
  : setsValidos.length >= 2 && Boolean(ganadorId) && validacionSets.esValido;
```

## Flujo de Uso

### Caso 1: Partido con solo 2 sets (6-4, 6-2)

1. Usuario carga Set 1: `6-4` ✅
2. Usuario carga Set 2: `6-2` ✅
3. Set 3 queda vacío (opcional)
4. Sistema calcula ganador automáticamente
5. Usuario guarda → Resultado: `6-4, 6-2`

### Caso 2: Partido con tercer set normal (6-4, 3-6, 6-3)

1. Usuario carga Set 1: `6-4` ✅
2. Usuario carga Set 2: `3-6` ✅
3. Usuario selecciona "Tercer Set (6 games)"
4. Inputs del Set 3 se habilitan con validación estricta (1 dígito, max 7)
5. Usuario carga Set 3: `6-3` ✅
6. Sistema calcula ganador automáticamente
7. Usuario guarda → Resultado: `6-4, 3-6, 6-3`

### Caso 3: Partido con Super Tie-Break (6-4, 3-6, 10-8)

1. Usuario carga Set 1: `6-4` ✅
2. Usuario carga Set 2: `3-6` ✅
3. Usuario selecciona "Super Tie-Break (a 10 pts)"
4. Inputs del Set 3 se habilitan con validación de tie-break (2 dígitos, max 25)
5. Usuario carga Set 3: `10-8` ✅
6. Sistema calcula ganador automáticamente
7. Usuario guarda → Resultado: `6-4, 3-6, 10-8`
8. Sistema muestra: "Se va a guardar como: 6-4, 3-6, 10-8 (Set 3 es Super TB)"

### Caso 4: Intento de puntaje inválido

1. Usuario intenta cargar Set 1: `7-0`
2. Sistema muestra error: "Set 1 tiene un puntaje inválido para tenis" 🔴
3. Botón "Guardar resultado" queda deshabilitado
4. Usuario corrige a `6-0` ✅
5. Error desaparece, botón se habilita

## Casos de Prueba

### Validación de Sets Normales

| Entrada | ¿Válido? | Razón |
|---------|----------|-------|
| 6-0 | ✅ | Victoria clara |
| 6-4 | ✅ | Victoria por 2+ games |
| 7-5 | ✅ | Set extendido válido |
| 7-6 | ✅ | Tie-break regular |
| 7-0 | ❌ | No se puede ganar 7-0 |
| 6-6 | ❌ | Empate no permitido |
| 8-6 | ❌ | Fuera de rango |
| 7-3 | ❌ | No se puede tener 7-3 |

### Validación de Super Tie-Break

| Entrada | ¿Válido? | Razón |
|---------|----------|-------|
| 10-8 | ✅ | Victoria a 10 con ventaja |
| 11-9 | ✅ | Tie-break extendido |
| 12-10 | ✅ | Ventaja de 2 |
| 10-0 | ✅ | Tie-break perfecto |
| 10-9 | ❌ | No es ventaja de 2 |
| 9-7 | ❌ | No llegó a 10 |
| 10-10 | ❌ | Empate imposible |
| 11-8 | ❌ | Diferencia de 3 |

## Compatibilidad

### Edición de Resultados Existentes

El sistema detecta automáticamente el formato al editar:
- Si el resultado original es `6-4, 3-6, 10-3` → detecta "Super Tie-Break"
- Si el resultado original es `6-4, 3-6, 6-3` → detecta "Tercer Set"
- Los inputs se configuran automáticamente según el formato detectado

### Integración con el Cálculo de Ranking

Esta validación del frontend es independiente de la corrección del cálculo de diferencia de games implementada en `lib/motor-ranking.ts`:
- El frontend **previene** que se carguen datos inválidos
- El backend **calcula correctamente** los Super Tie-Breaks como 1-0

Ambas mejoras trabajan en conjunto para garantizar datos limpios y cálculos precisos.

## Archivos Modificados

- ✅ `components/ModalCargarResultado.tsx` - Implementación completa de la validación

## Estado

✅ **COMPLETADO** - 2026-08-28

La interfaz ahora previene errores de carga de resultados y guía al usuario a través de un proceso intuitivo y validado para todos los tipos de partidos de tenis.
