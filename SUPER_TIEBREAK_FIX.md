# Corrección del Cálculo de Diferencia de Games - Super Tie-Break

## Problema Identificado

El sistema estaba sumando los puntos del Super Tie-Break (ej: 10-3, 10-8) como games regulares en el cálculo de la diferencia de games para el ranking y tablas de posiciones. Esto generaba distorsiones absurdas como diferencias de +7 o +8 en un solo desempate.

### Ejemplo del Problema Anterior

Partido: Jugador A vs Jugador B → 6-4, 3-6, 10-3

**Cálculo incorrecto anterior:**
- Games Jugador A: 6 + 3 + 10 = **19 games**
- Games Jugador B: 4 + 6 + 3 = **13 games**
- Diferencia para A: **+6** (distorsionado por el Super Tie-Break)

## Solución Implementada

Se agregó lógica para detectar automáticamente cuando un set es un Super Tie-Break y tratarlo correctamente como **1 game a 0** para el ganador del desempate.

### Detección de Super Tie-Break

```typescript
export function esSuperTieBreak(set: { j1: number; j2: number }): boolean {
  const max = Math.max(set.j1, set.j2);
  const min = Math.min(set.j1, set.j2);
  
  // Super Tie-Break: el ganador tiene 10+ puntos
  // Ejemplos: 10-3, 10-8, 11-9, 12-10, etc.
  return max >= 10 && min < max;
}
```

**Criterios de detección:**
- El puntaje más alto debe ser **10 o más puntos**
- El puntaje más bajo debe ser **menor que el más alto** (para evitar empates imposibles como 10-10)

**Casos detectados correctamente:**
- ✅ `10-3` → Super Tie-Break
- ✅ `10-8` → Super Tie-Break
- ✅ `11-9` → Super Tie-Break (tie-break extendido)
- ✅ `12-10` → Super Tie-Break (tie-break extendido)
- ❌ `7-6` → Set normal con tie-break regular (NO es Super Tie-Break)
- ❌ `6-4` → Set normal
- ❌ `7-5` → Set normal

### Cálculo Corregido

```typescript
for (const set of sets) {
  if (esSuperTieBreak(set)) {
    // Super Tie-Break: cuenta como 1 game para el ganador, 0 para el perdedor
    if (set.j1 > set.j2) {
      gamesJ1 += 1;
    } else {
      gamesJ2 += 1;
    }
  } else {
    // Set normal: suma los games reales
    gamesJ1 += set.j1;
    gamesJ2 += set.j2;
  }
}
```

### Ejemplo del Cálculo Correcto

Partido: Jugador A vs Jugador B → 6-4, 3-6, 10-3

**Cálculo correcto actual:**
- Set 1: 6-4 (normal) → 6 games para A, 4 para B
- Set 2: 3-6 (normal) → 3 games para A, 6 para B
- Set 3: 10-3 (Super Tie-Break detectado) → **1 game para A, 0 para B**
- **Total:** A = 10 games, B = 10 games
- **Diferencia para A: 0** (correcto!)

Otro ejemplo: 6-3, 4-6, 10-8

**Cálculo correcto:**
- Set 1: 6-3 (normal) → 6 games para A, 3 para B
- Set 2: 4-6 (normal) → 4 games para A, 6 para B
- Set 3: 10-8 (Super Tie-Break) → **1 game para A, 0 para B**
- **Total:** A = 11 games, B = 9 games
- **Diferencia para A: +2** (razonable)

## Impacto de la Corrección

### Archivos Modificados

**`lib/motor-ranking.ts`:**
1. Nueva función `esSuperTieBreak()` para detectar Super Tie-Breaks automáticamente
2. Modificación de `diferenciaGamesCircuito()` para tratar Super Tie-Breaks como 1-0

### Alcance de la Corrección

Esta corrección aplica automáticamente a:
- ✅ **Ranking general del circuito** (`/ranking`)
- ✅ **Tablas de posiciones de zonas/grupos** (torneos con fase de grupos)
- ✅ **Perfiles de jugadores** (`/jugadores/[id]` y `/perfil`)
- ✅ **Cálculo de clasificados** (basado en diferencia de games)

Todos estos módulos usan la función `diferenciaGamesCircuito()` centralizada, por lo que la corrección se propaga automáticamente a toda la aplicación.

## Validación

### Casos de Prueba

| Resultado | Set 1 | Set 2 | Set 3 | Games J1 | Games J2 | Diferencia |
|-----------|-------|-------|-------|----------|----------|------------|
| 6-4, 6-2 | 6-4 (normal) | 6-2 (normal) | - | 12 | 6 | +6 |
| 6-4, 3-6, 6-3 | 6-4 (normal) | 3-6 (normal) | 6-3 (normal) | 15 | 13 | +2 |
| 6-4, 3-6, 10-3 | 6-4 (normal) | 3-6 (normal) | 10-3 (STB) | 10 | 10 | 0 |
| 7-6, 4-6, 10-8 | 7-6 (normal) | 4-6 (normal) | 10-8 (STB) | 12 | 12 | 0 |
| 3-6, 6-3, 12-10 | 3-6 (normal) | 6-3 (normal) | 12-10 (STB) | 10 | 9 | +1 |

### Verificación Manual

Para verificar que la corrección funciona:

1. Crear/editar un partido con resultado que incluya Super Tie-Break (ej: `6-4, 3-6, 10-3`)
2. Verificar en `/ranking` que la diferencia de games es razonable
3. Verificar en el perfil del jugador que la diferencia de games no está inflada
4. Si el torneo tiene zonas, verificar que la tabla de posiciones muestra diferencias correctas

## Notas Técnicas

### ¿Por qué 10+ puntos?

Un Super Tie-Break se juega a 10 puntos con ventaja de 2, por lo que:
- Puntajes comunes: 10-0, 10-1, 10-2, ..., 10-8
- Puntajes extendidos: 11-9, 12-10, 13-11, etc.

El criterio `max >= 10` captura todos estos casos.

### ¿Qué pasa con 7-6?

Un set que termina 7-6 indica un tie-break **regular** (a 7 puntos) jugado dentro de un set completo. Este NO es un Super Tie-Break:
- El set sigue siendo 7 games vs 6 games
- Se cuenta como 7-6 en la diferencia de games
- Es completamente correcto sumarlo como games reales

### Compatibilidad hacia atrás

La corrección es **retroactiva**: al recalcular el ranking, todos los partidos históricos con Super Tie-Breaks serán procesados correctamente de forma automática sin necesidad de recargar resultados.

## Estado: ✅ COMPLETADO

Fecha: 2026-08-28
Autor: Full-Stack Senior Architect
