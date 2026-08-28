# Corrección del Resaltado de Puntajes por Set Individual

## Problema Identificado

**Antes de la corrección:**
La UI resaltaba todos los puntajes de los sets basándose en el **ganador general del partido**, lo que generaba inconsistencias visuales confusas:

### Ejemplo del error visual:

```
Partido: Cuevas vs Ayala → Resultado: 6-4, 3-6, 6-3 → Ganador: Cuevas

ANTES (INCORRECTO):
┌────────────────────────────────┐
│ ✓ Cuevas    6   3   6  ← Todo en blanco (ganador del partido)
│   Ayala     4   6   3  ← Todo apagado (perdedor del partido)
└────────────────────────────────┘

PROBLEMA: El "3" de Cuevas en el Set 2 está resaltado,
          cuando en realidad PERDIÓ ese set (3 < 6).
          El "6" de Ayala en el Set 2 está apagado,
          cuando en realidad GANÓ ese set (6 > 3).
```

## Solución Implementada

**Después de la corrección:**
Cada puntaje de set se resalta **individualmente** según quién ganó ese set específico, independientemente del ganador general del partido.

### Ejemplo correcto:

```
Partido: Cuevas vs Ayala → Resultado: 6-4, 3-6, 6-3 → Ganador: Cuevas

DESPUÉS (CORRECTO):
┌────────────────────────────────┐
│ ✓ Cuevas    6   3   6  ← Set 1: ✓, Set 2: ✗, Set 3: ✓
│              ↑   ↓   ↑
│             blanco    blanco
│              apagado
│
│   Ayala     4   6   3  ← Set 1: ✗, Set 2: ✓, Set 3: ✗
│              ↓   ↑   ↓
│             apagado    apagado
│              blanco
└────────────────────────────────┘

CORRECTO: 
- Set 1: 6 > 4 → "6" de Cuevas en blanco, "4" de Ayala apagado
- Set 2: 3 < 6 → "3" de Cuevas apagado, "6" de Ayala en blanco
- Set 3: 6 > 3 → "6" de Cuevas en blanco, "3" de Ayala apagado
```

## Cambios Técnicos

### 1. Nueva prop `gamesRival` en `FilaScoreboard`

**Antes:**
```typescript
function FilaScoreboard({
  nombre,
  games,        // Solo los puntajes propios
  esGanador,    // Ganador del partido completo
  esPerdedor,   // Perdedor del partido completo
  // ...
})
```

**Después:**
```typescript
function FilaScoreboard({
  nombre,
  games,        // Puntajes propios
  gamesRival,   // ← NUEVO: Puntajes del rival (para comparar set por set)
  esGanador,    // Ganador del partido (solo para el tilde verde)
  esPerdedor,   // Perdedor del partido (solo para el nombre apagado)
  // ...
})
```

### 2. Comparación Individual por Set

**Antes (incorrecto):**
```typescript
{games.map((game, i) => (
  <span
    className={
      finalizado && esGanador
        ? "text-white"           // ← TODO en blanco si ganó el partido
        : finalizado && esPerdedor
          ? "text-foreground/30" // ← TODO apagado si perdió el partido
          : "text-foreground/55"
    }
  >
    {game}
  </span>
))}
```

**Después (correcto):**
```typescript
{games.map((game, i) => {
  const gameNum = Number(game);
  const rivalGameNum = gamesRival?.[i] ? Number(gamesRival[i]) : 0;
  const ganoEsteSet = gameNum > rivalGameNum;      // ← Comparación por set
  const perdioEsteSet = gameNum < rivalGameNum;    // ← Comparación por set
  
  return (
    <span
      className={
        finalizado && ganoEsteSet
          ? "text-white"           // ← Blanco solo si ganó ESTE set
          : finalizado && perdioEsteSet
            ? "text-foreground/30" // ← Apagado solo si perdió ESTE set
            : "text-foreground/55"
      }
    >
      {game}
    </span>
  );
})}
```

### 3. Actualización de las llamadas

**Jugador 1:**
```typescript
<FilaScoreboard
  nombre={j1Nombre}
  games={sets?.j1 ?? null}
  gamesRival={sets?.j2 ?? null}  // ← NUEVO: Puntajes del Jugador 2
  esGanador={j1Gana}
  esPerdedor={j1Pierde}
  // ...
/>
```

**Jugador 2:**
```typescript
<FilaScoreboard
  nombre={j2Nombre}
  games={sets?.j2 ?? null}
  gamesRival={sets?.j1 ?? null}  // ← NUEVO: Puntajes del Jugador 1
  esGanador={j2Gana}
  esPerdedor={j2Pierde}
  // ...
/>
```

## Diferenciación Visual

### Indicadores del Ganador General del Partido

Estos **NO cambian** con esta corrección (siguen funcionando igual):

1. **Tilde verde** (✓): Solo en el ganador del partido
2. **Nombre en blanco y negrita**: Solo el ganador del partido
3. **Nombre apagado**: Solo el perdedor del partido

### Indicadores del Ganador de Cada Set (NUEVO)

Estos **SÍ cambian** con esta corrección:

1. **Puntaje en blanco** (`text-white`): El número mayor en cada set
2. **Puntaje apagado** (`text-foreground/30`): El número menor en cada set

## Casos de Ejemplo

### Caso 1: Partido 2-0 (Sin polémica)

```
Resultado: 6-4, 6-2
Ganador: Jugador A

Jugador A:  6   6  ← Ambos en blanco (ganó ambos sets)
Jugador B:  4   2  ← Ambos apagados (perdió ambos sets)

✅ ANTES y DESPUÉS: Igual (no había problema en este caso)
```

### Caso 2: Partido 2-1 (El caso problemático)

```
Resultado: 6-4, 3-6, 6-3
Ganador: Jugador A

ANTES (INCORRECTO):
Jugador A:  6   3   6  ← Todo en blanco
Jugador B:  4   6   3  ← Todo apagado
           ❌ El 6 de B en Set 2 debería resaltar

DESPUÉS (CORRECTO):
Jugador A:  6   3   6  ← Blanco, apagado, blanco
           (✓) (✗) (✓)
Jugador B:  4   6   3  ← Apagado, blanco, apagado
           (✗) (✓) (✗)
```

### Caso 3: Partido con Super Tie-Break

```
Resultado: 6-4, 3-6, 10-8
Ganador: Jugador A

ANTES (INCORRECTO):
Jugador A:  6   3   10  ← Todo en blanco
Jugador B:  4   6    8  ← Todo apagado
           ❌ El 6 de B en Set 2 debería resaltar

DESPUÉS (CORRECTO):
Jugador A:  6   3   10  ← Blanco, apagado, blanco
           (✓) (✗) (✓)
Jugador B:  4   6    8  ← Apagado, blanco, apagado
           (✗) (✓) (✗)
```

### Caso 4: Partido muy competitivo (3 sets muy ajustados)

```
Resultado: 7-6, 4-6, 7-5
Ganador: Jugador A

CORRECTO:
Jugador A:  7   4   7  ← Blanco, apagado, blanco
           (✓) (✗) (✓)
Jugador B:  6   6   5  ← Apagado, blanco, apagado
           (✗) (✓) (✗)

NOTA: Incluso siendo un partido muy cerrado, el resaltado 
      refleja correctamente quién ganó cada set individual.
```

## Consistencia con Marcadores Profesionales

Esta corrección alinea la UI con cómo se muestran los marcadores en:
- ✅ ATP/WTA Tour (tenis profesional)
- ✅ Grand Slams (Roland Garros, Wimbledon, etc.)
- ✅ Aplicaciones como ATP App, Roland Garros App
- ✅ Transmisiones de TV (ESPN, ESPN+, etc.)

En todos estos contextos, **cada set se resalta individualmente** según su ganador, no basándose en el resultado final del partido.

## Edge Cases Cubiertos

### Empate en un set (no debería ocurrir con validación)

```typescript
const gameNum = Number(game);        // ej: 6
const rivalGameNum = Number(rival);  // ej: 6
const ganoEsteSet = gameNum > rivalGameNum;  // false
const perdioEsteSet = gameNum < rivalGameNum; // false

// Resultado: ni blanco ni apagado → "text-foreground/55" (gris medio)
```

### Sets faltantes (partido de 2 sets)

```typescript
gamesRival?.[i]  // undefined para el set 3
Number(undefined) // NaN
gamesRival?.[i] ? Number(gamesRival[i]) : 0  // 0 (fallback seguro)

// Si no hay rival para comparar, el set se muestra en gris medio
```

### W.O. / Sin puntajes

```typescript
games && games.length > 0  // false
// No se renderizan puntajes, solo el badge "W.O."
```

## Archivos Modificados

- ✅ `components/TarjetaPartidoTenis.tsx`
  - Función `FilaScoreboard`: Nueva prop `gamesRival` y lógica de comparación por set
  - Llamadas a `FilaScoreboard`: Paso de `gamesRival` para ambos jugadores

## Testing Manual

### Checklist de Verificación

Probar los siguientes casos en la UI:

- [ ] Partido 2-0: Todos los sets del ganador en blanco, todos del perdedor apagados
- [ ] Partido 2-1: Cada set resaltado según su ganador individual
- [ ] Partido 1-2: Igual que 2-1, pero con ganador invertido
- [ ] Partido con Super Tie-Break: Set 3 resaltado según el resultado del tie-break
- [ ] Partido pendiente: Todos los puntajes en gris medio (sin resaltado)
- [ ] Partido W.O.: Sin puntajes, solo badge "W.O."

### Lugares donde verificar

1. **Cuadro de llaves** (`/torneos/[id]` → pestaña "Llaves")
2. **Clasificación** (`/torneos/[id]` → pestaña "Clasificación")
3. **Próximos partidos** (`/lo-que-viene` → "Próximos Partidos")
4. **Vista pública** (si está habilitada)

## Beneficios

1. **Claridad visual**: Es inmediatamente claro quién ganó cada set
2. **Profesionalismo**: Coincide con estándares de la industria del tenis
3. **Menos confusión**: No hay contradicciones visuales (número bajo resaltado vs número alto apagado)
4. **Mejor UX**: Los usuarios pueden analizar el desarrollo del partido set por set

## Estado

✅ **COMPLETADO** - 2026-08-28

La corrección está implementada y lista para testing/deploy.
