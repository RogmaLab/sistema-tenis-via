# Motor Automático de Asignación de Horarios - Matching Engine

## Resumen de Implementación

Se ha construido un sistema completo de asignación automática de horarios que cruza tres elementos fundamentales:
1. **Partidos pendientes** del torneo
2. **Disponibilidad declarada** por cada jugador
3. **Turnos de canchas** configurados por el administrador

---

## Arquitectura del Sistema

### 1. Base de Datos - Disponibilidad de Jugadores

**Archivo:** `supabase/jugadores-disponibilidad.sql`

Se agregó una columna a la tabla `jugadores`:

```sql
disponibilidad_horaria bloque_horario[]
```

**Bloques horarios definidos:**
- `sabado_manana` (08:00-13:00)
- `sabado_tarde` (13:00-18:00)
- `sabado_noche` (18:00-22:00)
- `domingo_manana` (08:00-13:00)
- `domingo_tarde` (13:00-18:00)
- `domingo_noche` (18:00-22:00)

**Características:**
- Array de enums para máxima eficiencia
- Índice GIN para búsquedas rápidas
- Valores por defecto: disponibilidad completa (compatibilidad hacia atrás)

---

### 2. Types y Utilidades

#### **Archivo:** `lib/types.ts`

**Nuevos tipos:**
```typescript
export type BloqueHorario =
  | "sabado_manana"
  | "sabado_tarde"
  | "sabado_noche"
  | "domingo_manana"
  | "domingo_tarde"
  | "domingo_noche";

export interface Jugador {
  // ... campos existentes
  disponibilidad_horaria?: BloqueHorario[];
}
```

#### **Archivo:** `lib/disponibilidad-jugadores.ts`

**Funciones clave:**

1. **`infoBloque(bloque)`**: Obtiene día y rango de horas
2. **`bloqueDeHora(dia, hora)`**: Determina el bloque de una hora específica
3. **`bloquesComunes(disponibilidades)`**: Encuentra intersección de disponibilidades
4. **`estaDisponibleEnHora(disp, dia, hora)`**: Verifica disponibilidad en hora exacta
5. **`tienenDisponibilidadComun(disp1, disp2, dia, hora)`**: Match de dos jugadores

---

### 3. Algoritmo de Asignación Mejorado

#### **Archivo:** `lib/auto-asignar-horarios.ts`

**Cambios principales:**

1. **Nuevo tipo:** `BloqueHorarioCancha` (renombrado de `BloqueHorario` para evitar conflicto)
   ```typescript
   export interface BloqueHorarioCancha {
     cancha: string;
     inicioMs: number;
     finMs: number;
     fecha_programada: string;
     dia: DiaFinDeSemana;
     hora: string; // "HH:MM"
   }
   ```

2. **Partidos con disponibilidad:**
   ```typescript
   export interface PartidoParaAsignar {
     // ... campos existentes
     jugador_1_disponibilidad?: BloqueHorario[];
     jugador_2_disponibilidad?: BloqueHorario[];
   }
   ```

3. **Nueva función:** `partidoTieneDisponibilidadEnBloque()`
   - Verifica si AMBOS jugadores están disponibles en el bloque propuesto
   - Usa `tienenDisponibilidadComun()` internamente

4. **Resultado mejorado:**
   ```typescript
   return {
     asignaciones: AsignacionHorario[];      // Partidos asignados
     sinSlot: PartidoParaAsignar[];          // Sin slot libre (conflictos de cancha/jugador)
     sinDisponibilidad: PartidoParaAsignar[]; // Sin disponibilidad común ✨ NUEVO
     omitidos: number;                        // Finalizados o con un BYE
   }
   ```

**Lógica de asignación:**

```typescript
for (const partido of pendientes) {
  const elegido = bloques.find((bloque) => {
    // 1. No está usado
    if (bloquesUsados.has(clave)) return false;
    
    // 2. No hay conflicto de cancha ni jugadores
    if (!bloqueLibre(bloque, ocupaciones, jugadores)) return false;
    
    // 3. ✨ NUEVO: Ambos jugadores están disponibles en este bloque
    if (!partidoTieneDisponibilidadEnBloque(partido, bloque)) return false;
    
    return true;
  });
  
  if (!elegido) {
    // Clasificar el motivo del fallo
    const hayDisponibilidadComun = bloques.some((b) => 
      partidoTieneDisponibilidadEnBloque(partido, b)
    );
    
    if (!hayDisponibilidadComun) {
      sinDisponibilidad.push(partido); // ✨ NUEVO: Sin match de disponibilidad
    } else {
      sinSlot.push(partido); // Hay disponibilidad, pero no hay slot libre
    }
  }
}
```

---

### 4. Función de Ejecución Mejorada

#### **Archivo:** `lib/programacion-canchas.ts`

**Mejoras en `ejecutarAutoAsignacion()`:**

1. **Fetch de disponibilidad:**
   ```typescript
   const { data: partidosData } = await supabase
     .from("partidos")
     .select(`
       id, estado, tipo_fase, fase, ronda, numero_slot, categoria, 
       jugador_1_id, jugador_2_id, fecha_programada, cancha,
       jugador_1:jugador_1_id(disponibilidad_horaria),
       jugador_2:jugador_2_id(disponibilidad_horaria)
     `)
     .eq("torneo_id", torneoId);
   ```

2. **Mapeo de datos:**
   ```typescript
   const partidos = partidosData.map((p) => ({
     // ... campos del partido
     jugador_1_disponibilidad: p.jugador_1?.disponibilidad_horaria ?? [],
     jugador_2_disponibilidad: p.jugador_2?.disponibilidad_horaria ?? [],
   }));
   ```

3. **Resultado enriquecido:**
   ```typescript
   return {
     asignados: number;
     sinSlot: number;
     sinDisponibilidad: number; // ✨ NUEVO
     omitidos: number;
     bloques: number;
     partidosSinDisponibilidad: Array<{ // ✨ NUEVO
       id: string;
       jugador_1: string | null;
       jugador_2: string | null;
       fase: string;
     }>;
   };
   ```

---

### 5. Componente de UI - Selector de Disponibilidad

#### **Archivo:** `components/SelectorDisponibilidad.tsx`

**Características:**

- ✅ Expandible/colapsable (no invasivo)
- ✅ Muestra resumen de disponibilidad actual
- ✅ Botones "Seleccionar todos" / "Limpiar todo"
- ✅ Separación visual por día (Sábado / Domingo)
- ✅ Checkboxes con labels descriptivos
- ✅ Estado de guardado con spinner
- ✅ Nota explicativa sobre el uso

**Props:**
```typescript
interface SelectorDisponibilidadProps {
  disponibilidadInicial: BloqueHorario[];
  onGuardar: (disponibilidad: BloqueHorario[]) => Promise<void>;
}
```

**Uso:**
```tsx
<SelectorDisponibilidad
  disponibilidadInicial={jugador.disponibilidad_horaria ?? []}
  onGuardar={async (disp) => {
    await supabase
      .from("jugadores")
      .update({ disponibilidad_horaria: disp })
      .eq("id", jugador.id);
  }}
/>
```

---

## Flujo Completo del Sistema

### Fase 1: Configuración Inicial

```
1. ADMIN configura disponibilidad de canchas
   └─> Panel de Control → Bloques de tiempo para cada cancha
   
2. JUGADORES declaran su disponibilidad
   └─> Mi Perfil → Selector de Disponibilidad Horaria
   
3. ADMIN valida que hay suficientes bloques configurados
   └─> Panel de Control → Ver resumen de bloques
```

### Fase 2: Ejecución de Auto-Asignación

```
1. ADMIN hace clic en "Ejecutar Asignación Automática"
   ↓
2. Sistema carga:
   - Partidos pendientes (con ambos jugadores definidos)
   - Disponibilidad de cada jugador
   - Bloques de cancha configurados
   ↓
3. Algoritmo de matching:
   Para cada partido (ordenado por prioridad):
     a. Busca bloques donde:
        - ✅ Ambos jugadores están disponibles
        - ✅ La cancha está libre
        - ✅ Ningún jugador tiene otro partido simultáneo
     b. Asigna el primer bloque que cumple todo
     c. Si no hay match:
        - ¿Hay disponibilidad común? → "Sin slot libre"
        - ¿No hay disponibilidad común? → "Sin disponibilidad común"
   ↓
4. Sistema actualiza partidos asignados en BD
   ↓
5. Muestra resumen al ADMIN:
   - ✅ X partidos asignados
   - ⚠️ Y partidos sin slot libre (necesitan más canchas)
   - ❌ Z partidos sin disponibilidad común (requieren intervención)
```

### Fase 3: Intervención Manual

```
Si hay partidos "Sin disponibilidad común":
  1. ADMIN revisa la lista
  2. ADMIN contacta a los jugadores
  3. OPCIONES:
     a. Jugadores ajustan su disponibilidad → Volver a ejecutar
     b. ADMIN asigna manualmente en horario especial
     c. ADMIN reprograma el partido para otro fin de semana
```

---

## Lógica de Prioridad

### Orden de Asignación de Partidos

1. **Por fase del torneo:**
   ```typescript
   const ORDEN_FASE = {
     Clasificacion: 0,           // Primero
     "Fase de Grupos": 1,
     "Dieciseisavos de Final": 2,
     "Octavos de Final": 3,
     "Cuartos de Final": 4,
     Semifinal: 5,
     Final: 6,                   // Último
   };
   ```

2. **Por categoría:** Alfabético (ej: "1ra" antes de "2da")

3. **Por número de slot:** Orden de bracket (1, 2, 3, ...)

**Razón:** Los partidos de clasificación y fases tempranas tienen prioridad para maximizar la probabilidad de asignación.

---

## Casos de Uso

### Caso 1: Asignación Exitosa (Happy Path)

```
Partido: Jugador A vs Jugador B
Disponibilidad A: [sabado_manana, sabado_tarde, domingo_manana]
Disponibilidad B: [sabado_tarde, domingo_manana, domingo_tarde]
Bloques comunes: [sabado_tarde, domingo_manana]

Bloques de cancha:
- Sábado 14:00 Cancha 1 ✅ (en sabado_tarde)
- Sábado 15:30 Cancha 1 ✅ (en sabado_tarde)
- Domingo 09:00 Cancha 2 ✅ (en domingo_manana)

Resultado: Asignado → Sábado 14:00 Cancha 1 (primer match)
```

### Caso 2: Sin Disponibilidad Común

```
Partido: Jugador C vs Jugador D
Disponibilidad C: [sabado_manana, sabado_tarde]
Disponibilidad D: [domingo_manana, domingo_tarde]
Bloques comunes: [] ❌

Resultado: Sin disponibilidad común
Acción: ADMIN debe intervenir o jugadores deben ajustar disponibilidad
```

### Caso 3: Disponibilidad Común pero Sin Slot

```
Partido: Jugador E vs Jugador F
Disponibilidad E: [sabado_manana]
Disponibilidad F: [sabado_manana]
Bloques comunes: [sabado_manana] ✅

Bloques de cancha en sabado_manana:
- Sábado 08:00 Cancha 1 ❌ (ocupado por otro partido)
- Sábado 09:30 Cancha 1 ❌ (Jugador E tiene otro partido)
- Sábado 11:00 Cancha 1 ❌ (ocupado)

Resultado: Sin slot libre (hay disponibilidad, pero no hay cancha/horario libre)
Acción: Agregar más canchas o más bloques horarios
```

---

## Compatibilidad y Retroactividad

### Jugadores sin disponibilidad declarada

```typescript
if (!disponibilidad || disponibilidad.length === 0) {
  // Se asume disponible TODO el tiempo (compatibilidad)
  return true;
}
```

**Comportamiento:**
- Jugadores existentes sin disponibilidad declarada = **disponibles en todos los bloques**
- Esto garantiza que el sistema funciona incluso si los jugadores no han declarado disponibilidad
- El sistema los migra con disponibilidad completa por defecto

---

## Ventajas del Sistema

### Para el Administrador:
1. ✅ **Automatización:** Asigna docenas de partidos en segundos
2. ✅ **Inteligencia:** Considera disponibilidad real de jugadores
3. ✅ **Transparencia:** Reporte claro de asignados, pendientes y bloqueados
4. ✅ **Flexibilidad:** Puede reasignar partidos programados si es necesario
5. ✅ **Control:** Lista clara de partidos que requieren atención manual

### Para los Jugadores:
1. ✅ **Autonomía:** Declaran su disponibilidad sin depender del admin
2. ✅ **Conveniencia:** Solo juegan en horarios que les convienen
3. ✅ **Claridad:** Ven exactamente qué bloques seleccionaron
4. ✅ **Simplicidad:** Interfaz clara y fácil de usar

### Para el Sistema:
1. ✅ **Escalabilidad:** Maneja torneos de cualquier tamaño
2. ✅ **Eficiencia:** Algoritmo O(n×m) donde n=partidos, m=bloques
3. ✅ **Robustez:** No falla si hay partidos sin match
4. ✅ **Extensibilidad:** Fácil agregar más reglas o restricciones

---

## Próximos Pasos de Integración

### Pendiente de Implementar:

1. **Integrar selector en perfil de jugador**
   - Agregar `<SelectorDisponibilidad />` en la página de perfil
   - Conectar con endpoint de guardado

2. **Actualizar Panel de Control**
   - Agregar botón "Ejecutar Asignación Automática"
   - Mostrar resumen de resultados
   - Crear tabla de "Partidos Pendientes de Asignación Manual"
   - Mostrar detalles de partidos sin disponibilidad

3. **Crear Modal de Resultados**
   - Resumen visual con íconos y números
   - Lista detallada de partidos no asignados
   - Sugerencias de acción para cada caso

4. **Testing y Ajustes**
   - Probar con diferentes configuraciones
   - Ajustar prioridades si es necesario
   - Optimizar rendimiento si hay muchos partidos

---

## Estado Actual

✅ **Base de datos:** Migración SQL lista  
✅ **Types:** Tipos TypeScript definidos  
✅ **Utilidades:** Funciones de disponibilidad implementadas  
✅ **Algoritmo:** Motor de matching completo  
✅ **Componente UI:** Selector de disponibilidad listo  
⏳ **Integración:** Pendiente conectar en UI  
⏳ **Panel Admin:** Pendiente actualizar visualización  

---

## Archivos Creados/Modificados

### Nuevos:
- ✅ `supabase/jugadores-disponibilidad.sql`
- ✅ `lib/disponibilidad-jugadores.ts`
- ✅ `components/SelectorDisponibilidad.tsx`
- ✅ `MOTOR_ASIGNACION_HORARIOS.md` (este archivo)

### Modificados:
- ✅ `lib/types.ts` - Agregado `BloqueHorario` y actualizado `Jugador`
- ✅ `lib/auto-asignar-horarios.ts` - Mejorado algoritmo con disponibilidad
- ✅ `lib/programacion-canchas.ts` - Actualizado `ejecutarAutoAsignacion`

---

**Fecha:** 2026-08-28  
**Estado:** Core completo, pendiente integración UI
