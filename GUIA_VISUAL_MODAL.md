# Guía Visual - Nuevo Modal de Resultados

## Vista General del Modal Mejorado

### Estructura del Formulario

```
┌─────────────────────────────────────────────────┐
│  Cargar Resultado                            ✕  │
│  Jugador A vs Jugador B                         │
├─────────────────────────────────────────────────┤
│                                                 │
│  [ ] W.O. / No presentación                     │
│                                                 │
│  Resultado por sets                             │
│  ┌───────────────────────────────────────────┐  │
│  │       │ Jugador A │   │ Jugador B │       │  │
│  ├───────────────────────────────────────────┤  │
│  │ Set 1 │    [6]    │ - │    [4]    │  ✓    │  │
│  │ (obligatorio)                             │  │
│  ├───────────────────────────────────────────┤  │
│  │ Set 2 │    [3]    │ - │    [6]    │  ✓    │  │
│  │ (obligatorio)                             │  │
│  ├───────────────────────────────────────────┤  │
│  │ Formato Set 3 (opcional)                  │  │
│  │  ┌─────────────┐  ┌──────────────────┐   │  │
│  │  │ Tercer Set  │  │ Super Tie-Break  │   │  │
│  │  │ (6 games)   │  │    (a 10 pts)    │   │  │
│  │  └─────────────┘  └──────────────────┘   │  │
│  ├───────────────────────────────────────────┤  │
│  │ Set 3 │   [10]    │ - │    [8]    │  ✓   │  │
│  │ (Super TB)                                │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ℹ️ Se va a guardar como: 6-4, 3-6, 10-8       │
│     (Set 3 es Super TB)                         │
│                                                 │
│  ▼ Ver puntajes válidos de tenis                │
│                                                 │
│  Quién ganó                                     │
│  ┌──────────────┐  ┌──────────────┐            │
│  │  Jugador A   │  │  Jugador B   │            │
│  └──────────────┘  └──────────────┘            │
│                                                 │
│  ┌──────────┐  ┌────────────────────┐          │
│  │ Cancelar │  │ Guardar resultado  │          │
│  └──────────┘  └────────────────────┘          │
└─────────────────────────────────────────────────┘
```

## Cambios Visuales Clave

### 1. Sets 1 y 2 - Validación Estricta

**ANTES:**
```
│ Set 1 │  [input type="number"]  │ - │  [input]  │
│       │   Sin límite de dígitos │   │           │
```

**DESPUÉS:**
```
│ Set 1 │  [6]  │ - │  [4]  │  ✅
│ (obligatorio)    maxLength=1    │
│                  max=7           │
```

**Características:**
- Input de texto con `inputMode="numeric"` (mejor que type="number")
- Solo permite **1 dígito**
- Rango automático **0-7**
- No permite escribir "66" o "10"

### 2. Selector de Formato para Set 3

**ANTES:**
```
│ Set 3 / Super TB │  [input]  │ - │  [input]  │
│                                                │
```

**DESPUÉS:**
```
│ Formato Set 3 (opcional)                      │
│  ┌─────────────────┐  ┌─────────────────┐    │
│  │  Tercer Set     │  │ Super Tie-Break │    │
│  │  (6 games)      │  │   (a 10 pts)    │    │
│  └─────────────────┘  └─────────────────┘    │
│                                                │
│ Set 3 │  [10]  │ - │  [8]  │  ✅             │
│ (Super TB)                                     │
```

**Características:**
- Dos botones para elegir formato
- Inputs deshabilitados hasta seleccionar formato
- Validación dinámica según formato elegido
- Badge visual indicando el tipo de set

### 3. Validación Visual con Errores

**Estado con Error:**
```
┌───────────────────────────────────────────────┐
│ ⚠️ Set 1 tiene un puntaje inválido para tenis │
│    Set 3 tiene un puntaje inválido para       │
│    Super Tie-Break                             │
└───────────────────────────────────────────────┘
```

**Banner de Error (Rojo):**
- Fondo: `bg-red-500/10`
- Borde: `border-red-500/30`
- Texto: `text-red-300`
- Ícono: AlertCircle (lucide-react)

### 4. Resumen Dinámico

**Sin Sets Cargados:**
```
ℹ️ Cargá al menos el Set 1 y el Set 2. El Set 3 es opcional.
```

**Con Sets Normales:**
```
ℹ️ Se va a guardar como: 6-4, 3-6, 6-3
```

**Con Super Tie-Break:**
```
ℹ️ Se va a guardar como: 6-4, 3-6, 10-8 (Set 3 es Super TB)
                                        ^^^^^^^^^^^^^^^^
                                        Badge en color accent
```

### 5. Ayuda Contextual Expandible

**Cerrado:**
```
▼ Ver puntajes válidos de tenis
```

**Expandido:**
```
▲ Ver puntajes válidos de tenis

┌─────────────────────────────────────────────┐
│ Sets normales: 6-0, 6-1, 6-2, 6-3, 6-4,    │
│                7-5, 7-6                      │
│                                              │
│ Super Tie-Break: Se juega a 10 puntos       │
│                  (ej: 10-8, 11-9, 12-10)    │
└─────────────────────────────────────────────┘
```

## Flujos de Interacción

### Flujo A: Partido 2-0 (Sin Set 3)

```
1. Usuario abre modal
   ↓
2. Carga Set 1: escribe "6", luego "4"
   → Input limita a 1 dígito
   → Validación: 6-4 ✅
   ↓
3. Carga Set 2: escribe "6", luego "2"
   → Validación: 6-2 ✅
   ↓
4. Deja Set 3 vacío (opcional)
   ↓
5. Resumen: "Se va a guardar como: 6-4, 6-2"
   ↓
6. Ganador calculado automáticamente
   ↓
7. Botón "Guardar resultado" habilitado ✅
   ↓
8. Guarda exitosamente
```

### Flujo B: Partido con Tercer Set Normal

```
1. Usuario abre modal
   ↓
2. Carga Set 1: 6-4 ✅
   Carga Set 2: 3-6 ✅
   ↓
3. Ve botones de formato Set 3
   ↓
4. Hace clic en "Tercer Set (6 games)"
   → Formato: "full"
   → Inputs Set 3 habilitados
   → maxLength=1, max=7
   ↓
5. Carga Set 3: escribe "6", luego "3"
   → Validación: 6-3 ✅
   ↓
6. Resumen: "Se va a guardar como: 6-4, 3-6, 6-3"
   ↓
7. Guarda exitosamente
```

### Flujo C: Partido con Super Tie-Break

```
1. Usuario abre modal
   ↓
2. Carga Set 1: 6-4 ✅
   Carga Set 2: 3-6 ✅
   ↓
3. Hace clic en "Super Tie-Break (a 10 pts)"
   → Formato: "super_tb"
   → Inputs Set 3 habilitados
   → maxLength=2, max=25
   → Placeholder: "0-25"
   ↓
4. Carga Set 3: escribe "1", "0", luego "8"
   → Permite 2 dígitos: "10"
   → Validación: 10-8 ✅
   ↓
5. Resumen: "Se va a guardar como: 6-4, 3-6, 10-8 (Set 3 es Super TB)"
                                                    ^^^^^^^^^^^^^^^^^^
   ↓
6. Guarda exitosamente
```

### Flujo D: Error de Validación

```
1. Usuario carga Set 1: escribe "7", luego "0"
   → Input acepta ambos dígitos
   → Validación: 7-0 ❌
   ↓
2. Banner rojo aparece:
   "⚠️ Set 1 tiene un puntaje inválido para tenis"
   ↓
3. Botón "Guardar resultado" deshabilitado 🔒
   ↓
4. Usuario cambia a "6-0"
   → Validación: 6-0 ✅
   ↓
5. Banner desaparece
   Botón habilitado ✅
   ↓
6. Continúa normalmente
```

### Flujo E: Cambio de Formato Set 3

```
1. Usuario selecciona "Tercer Set (6 games)"
   ↓
2. Carga Set 3: "6-3"
   ↓
3. Cambia de opinión, clic en "Super Tie-Break"
   → Inputs Set 3 se limpian automáticamente ("")
   → maxLength cambia de 1 a 2
   → Placeholder cambia de "0-7" a "0-25"
   ↓
4. Carga nuevo Set 3: "10-8"
   ↓
5. Continúa normalmente
```

## Detalles de Implementación UI

### Botones de Formato Set 3

**No seleccionado:**
```css
border: border-border
background: bg-background
color: text-foreground/60
hover: border-foreground/30, text-foreground
```

**Seleccionado:**
```css
border: border-accent
background: bg-accent/15
color: text-accent
```

### Inputs con Validación

**Normal:**
```css
border: border-border
focus: border-accent, ring-2 ring-accent/30
```

**Con error (implícito por banner):**
- No cambia el estilo del input
- Error mostrado en banner general
- Más limpio visualmente

### Placeholders Dinámicos

**Set 3 con Tercer Set:**
```html
<input placeholder="0-7" />
```

**Set 3 con Super Tie-Break:**
```html
<input placeholder="0-25" />
```

### Badge de Tipo de Set

**En la label del Set 3:**
```html
Set 3 <span class="text-accent">(Super TB)</span>
```

**En el resumen:**
```html
6-4, 3-6, 10-8 <span class="text-accent">(Set 3 es Super TB)</span>
```

## Accesibilidad

### Labels y ARIA

```html
<!-- Set 1 -->
<label for="set-0-j1">Set 1 (obligatorio)</label>
<input id="set-0-j1" ... />

<!-- Set 2 -->
<input aria-label="Set 2, games del lado 2" ... />

<!-- Set 3 -->
<label>Formato Set 3 (opcional)</label>
<button role="button" aria-label="Seleccionar Tercer Set">...</button>
```

### Navegación por Teclado

- ✅ Tab entre inputs
- ✅ Enter en botones de formato
- ✅ Enter en formulario para guardar
- ✅ Escape para cerrar modal (comportamiento existente)

### Feedback Visual para Lectores de Pantalla

- Íconos decorativos con `aria-hidden`
- Mensajes de error en texto plano
- Estados de botones con atributos ARIA apropiados

## Responsive Design

### Mobile (< 640px)

```
┌──────────────────────────┐
│ Cargar Resultado      ✕ │
│ Jugador A vs Jugador B  │
├─────────────────────────┤
│ Set 1    [6]  -  [4]    │
│ Set 2    [3]  -  [6]    │
│                         │
│ Formato Set 3           │
│ ┌─────────┐             │
│ │ Tercer  │ (stacked)   │
│ │  Set    │             │
│ └─────────┘             │
│ ┌─────────┐             │
│ │ Super   │             │
│ │Tie-Break│             │
│ └─────────┘             │
│                         │
│ Set 3   [10]  -  [8]    │
└─────────────────────────┘
```

### Desktop (≥ 640px)

```
┌─────────────────────────────────────┐
│ Cargar Resultado                 ✕ │
│ Jugador A vs Jugador B             │
├────────────────────────────────────┤
│ Set 1       [6]  -  [4]            │
│ Set 2       [3]  -  [6]            │
│                                    │
│ Formato Set 3                      │
│ ┌──────────┐  ┌──────────────┐    │
│ │ Tercer   │  │    Super     │    │
│ │   Set    │  │  Tie-Break   │    │
│ └──────────┘  └──────────────┘    │
│                                    │
│ Set 3       [10]  -  [8]           │
└────────────────────────────────────┘
```

## Estado Final

✅ **Implementado completamente** - 2026-08-28

Todas las mejoras visuales y de UX están funcionando en producción.
