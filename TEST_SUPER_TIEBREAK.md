# Plan de Pruebas - Corrección Super Tie-Break

## Objetivo
Verificar que los Super Tie-Breaks se calculan correctamente como **1 game a 0** en lugar de sumar los puntos reales (ej: 10-3) a la diferencia de games.

## Escenarios de Prueba

### Escenario 1: Partido con Super Tie-Break clásico

**Configuración:**
- Jugador A vs Jugador B
- Resultado: `6-4, 3-6, 10-3`

**Resultado Esperado:**
- Set 1: 6-4 (normal) → 6 games vs 4 games
- Set 2: 3-6 (normal) → 3 games vs 6 games  
- Set 3: 10-3 (Super Tie-Break) → **1 game vs 0 games**
- **Total:** 10 games vs 10 games
- **Diferencia para A:** 0 (neutral)

**Dónde verificar:**
1. `/ranking` - Columna "Dif. Games"
2. `/jugadores/[id]` - Ficha del jugador, estadísticas
3. Si hay zonas/grupos - Tabla de posiciones del torneo

---

### Escenario 2: Super Tie-Break ajustado (10-8)

**Configuración:**
- Jugador C vs Jugador D
- Resultado: `7-6, 4-6, 10-8`

**Resultado Esperado:**
- Set 1: 7-6 (normal, incluye tie-break regular) → 7 games vs 6 games
- Set 2: 4-6 (normal) → 4 games vs 6 games
- Set 3: 10-8 (Super Tie-Break) → **1 game vs 0 games**
- **Total:** 12 games vs 12 games
- **Diferencia para C:** 0 (neutral)

---

### Escenario 3: Super Tie-Break extendido (12-10)

**Configuración:**
- Jugador E vs Jugador F
- Resultado: `3-6, 6-3, 12-10`

**Resultado Esperado:**
- Set 1: 3-6 (normal) → 3 games vs 6 games
- Set 2: 6-3 (normal) → 6 games vs 3 games
- Set 3: 12-10 (Super Tie-Break extendido) → **1 game vs 0 games**
- **Total:** 10 games vs 9 games
- **Diferencia para E:** +1 (positivo, pero razonable)

---

### Escenario 4: Partido sin Super Tie-Break (control)

**Configuración:**
- Jugador G vs Jugador H
- Resultado: `6-4, 3-6, 6-3`

**Resultado Esperado:**
- Set 1: 6-4 (normal) → 6 games vs 4 games
- Set 2: 3-6 (normal) → 3 games vs 6 games
- Set 3: 6-3 (normal) → 6 games vs 3 games
- **Total:** 15 games vs 13 games
- **Diferencia para G:** +2 (normal, sin Super Tie-Break)

---

### Escenario 5: Set 7-6 con tie-break regular (NO es Super Tie-Break)

**Configuración:**
- Jugador I vs Jugador J
- Resultado: `7-6, 6-4`

**Resultado Esperado:**
- Set 1: 7-6 (normal con tie-break a 7 pts) → **7 games vs 6 games** (NO se convierte a 1-0)
- Set 2: 6-4 (normal) → 6 games vs 4 games
- **Total:** 13 games vs 10 games
- **Diferencia para I:** +3 (correcto, el 7-6 cuenta como games reales)

**Nota importante:** Un set 7-6 NO es un Super Tie-Break. Es un set normal que se definió con un tie-break regular a 7 puntos. Debe contarse como 7 games vs 6 games.

---

## Proceso de Verificación

### Paso 1: Preparar datos de prueba
1. Acceder al panel de administración
2. Crear o seleccionar un torneo activo
3. Asegurarse de tener al menos 4-6 jugadores inscritos

### Paso 2: Crear partidos de prueba
Para cada escenario:
1. Crear un partido entre dos jugadores
2. Cargar el resultado especificado
3. Anotar los jugadores y el resultado

### Paso 3: Verificar cálculos

#### En la página de Ranking (`/ranking`)
1. Buscar a los jugadores involucrados en los partidos de prueba
2. Verificar la columna "Dif. Games"
3. Comparar con los valores esperados de cada escenario

**Ejemplo esperado:**

| Pos | Nombre | PJ | PG | Pts | Dif. Games |
|-----|--------|----|----|-----|------------|
| 1 | Jugador A | 1 | 1 | 4 | **0** ← No debe ser +7 |
| 2 | Jugador C | 1 | 1 | 4 | **0** ← No debe ser +2 |
| 3 | Jugador E | 1 | 1 | 4 | **+1** ← No debe ser +2 |
| 4 | Jugador G | 1 | 1 | 4 | +2 |
| 5 | Jugador I | 1 | 1 | 4 | +3 |

#### En el perfil del jugador (`/jugadores/[id]`)
1. Acceder al perfil de cada jugador que participó en los partidos de prueba
2. Verificar la sección de estadísticas
3. La "Diferencia de Games" debe coincidir con los valores esperados

#### En tablas de zona/grupos (si aplica)
1. Si el torneo tiene fase de grupos, verificar la tabla de posiciones
2. La columna "Dif. Games" debe mostrar los valores corregidos
3. El orden de la tabla debe reflejar correctamente las diferencias

---

## Errores Comunes a Detectar

### ❌ ERROR: Diferencia inflada
**Síntoma:** Un partido 6-4, 3-6, 10-3 muestra diferencia de +6 o +7  
**Causa:** El Super Tie-Break se está sumando como games reales (10 + 3 = 13)  
**Solución esperada:** Debe mostrar 0 (porque el STB cuenta como 1-0)

### ❌ ERROR: 7-6 tratado como Super Tie-Break
**Síntoma:** Un partido 7-6, 6-4 muestra diferencia de +2 en lugar de +3  
**Causa:** El set 7-6 se está convirtiendo incorrectamente a 1-0  
**Solución esperada:** Debe mostrar +3 (7+6=13 vs 6+4=10)

### ✅ CORRECTO: Super Tie-Break normalizado
**Síntoma:** Un partido 6-4, 3-6, 10-3 muestra diferencia de 0  
**Interpretación:** El Super Tie-Break (10-3) se contó como 1-0, resultando en 10-10 games totales

---

## Verificación Técnica (Opcional)

### Para desarrolladores: Verificar en la consola del navegador

1. Abrir DevTools (F12)
2. En la página de ranking, ejecutar:

```javascript
// Obtener los datos de un jugador específico
const jugadorId = 'uuid-del-jugador';
const respuesta = await fetch('/api/ranking');
const datos = await respuesta.json();
const jugador = datos.find(j => j.id === jugadorId);
console.log('Diferencia de games:', jugador.diferenciaGames);
```

3. Verificar que el valor coincide con lo esperado

---

## Casos Extremos

### Caso 1: Tie-break en el primer set
- `7-6, 6-3` → Diferencia: +4 (el 7-6 cuenta como normal)

### Caso 2: Super Tie-Break muy desequilibrado  
- `6-2, 3-6, 10-1` → Diferencia: 0 (el 10-1 cuenta como 1-0)

### Caso 3: Super Tie-Break muy ajustado
- `6-4, 2-6, 15-13` → Diferencia: +1 (el 15-13 cuenta como 1-0)

### Caso 4: Walkover (control negativo)
- Resultado: `W.O.` → Diferencia: 0 (no aporta games)

---

## Checklist de Validación

- [ ] Escenario 1 verificado (10-3)
- [ ] Escenario 2 verificado (10-8)
- [ ] Escenario 3 verificado (12-10)
- [ ] Escenario 4 verificado (sin Super Tie-Break)
- [ ] Escenario 5 verificado (7-6 NO es Super Tie-Break)
- [ ] Ranking general muestra valores correctos
- [ ] Perfiles de jugadores muestran valores correctos
- [ ] Tablas de zona/grupos (si aplica) muestran valores correctos
- [ ] Partidos históricos se recalcularon correctamente
- [ ] No hay diferencias de games absurdas (+7, +8, etc.)

---

## Resultado Esperado Final

✅ **ÉXITO:** Todos los Super Tie-Breaks cuentan como 1-0  
✅ **ÉXITO:** Los sets normales (incluyendo 7-6) cuentan como games reales  
✅ **ÉXITO:** No hay diferencias de games distorsionadas  
✅ **ÉXITO:** El orden del ranking es justo y preciso

---

## Notas de Implementación

- La corrección es **retroactiva**: partidos históricos se recalculan automáticamente
- El cambio afecta a todo el sistema: ranking, zonas, perfiles
- La UI sigue mostrando el score real (ej: "10-3"), pero el cálculo interno usa 1-0
- No se requiere recargar datos: el cambio es inmediato al actualizar la página
