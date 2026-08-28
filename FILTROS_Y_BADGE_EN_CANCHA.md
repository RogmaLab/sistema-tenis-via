# Filtros de Categoría y Badge "EN CANCHA"

## Fecha: 2026-08-28

---

## 🎯 Mejoras Implementadas

### 1. **Filtros Rápidos de Categoría (Pills)**
Botones tipo "pill" para filtrar instantáneamente por categoría (Todas, 3ra, 4ta, 5ta, Damas) sin recargar la página.

### 2. **Indicador "EN CANCHA"**
Badge visual con punto rojo parpadeando que indica cuando un partido está actualmente en progreso.

---

## ✅ Componentes Creados

### 1. Componente FiltrosCategorias

**Archivo creado:**
- ✅ `components/FiltrosCategorias.tsx`

```tsx
interface FiltrosCategoriasProps {
  categoriaActiva: CategoriaJugador | "todas";
  onCambiarCategoria: (categoria: CategoriaJugador | "todas") => void;
  conteos?: Record<CategoriaJugador | "todas", number>;
}

export function FiltrosCategorias({
  categoriaActiva,
  onCambiarCategoria,
  conteos,
}: FiltrosCategoriasProps) {
  // Renderiza botones tipo "pill" con conteos opcionales
}
```

**Características:**
- ✅ Botones tipo "pill" con bordes redondeados
- ✅ Categoría activa destacada con color accent
- ✅ Conteos opcionales (badge con número) en cada categoría
- ✅ Scroll horizontal en móvil si hay muchas categorías
- ✅ Transiciones suaves al cambiar de categoría

**Diseño visual:**

```
┌──────┬──────┬──────┬──────┬──────┐
│ Todas│ 3ra  │ 4ta  │ 5ta  │ Damas│
│  45  │  12  │  15  │  10  │   8  │ ← Conteos
└──────┴──────┴──────┴──────┴──────┘
   ↑ Activa (color accent)
```

---

### 2. Componente BadgeEnCancha

**Archivo creado:**
- ✅ `components/BadgeEnCancha.tsx`

```tsx
interface BadgeEnCanchaProps {
  compacto?: boolean;
  className?: string;
}

export function BadgeEnCancha({ compacto = false, className = "" }: BadgeEnCanchaProps) {
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full bg-red-500 ...`}>
      {/* Punto parpadeante con animación CSS */}
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white"></span>
      </span>
      
      {/* Texto */}
      <span className="font-bold uppercase tracking-wide text-white">
        EN CANCHA
      </span>
    </div>
  );
}
```

**Función de Validación:**

```tsx
/**
 * Determina si un partido está actualmente "en cancha".
 * 
 * Un partido está "en cancha" si:
 * 1. Tiene fecha programada
 * 2. La fecha programada es hoy
 * 3. La hora actual está dentro de la ventana del partido (hora inicio hasta 2 horas después)
 * 4. El estado NO es "Finalizado"
 */
export function estaEnCancha(params: {
  fechaProgramada: string | null | undefined;
  estado: string;
}): boolean {
  // Validaciones...
  
  // Calcular ventana del partido (hora inicio hasta 2 horas después)
  const horaInicio = fechaPartido.getTime();
  const horaFin = horaInicio + 2 * 60 * 60 * 1000; // +2 horas
  
  // Verificar si estamos dentro de la ventana
  return horaActual >= horaInicio && horaActual <= horaFin;
}
```

**Lógica Temporal:**

```
Ejemplo: Partido programado para hoy 15:00

14:59 → ❌ NO está en cancha (aún no empieza)
15:00 → ✅ EN CANCHA (hora de inicio)
15:30 → ✅ EN CANCHA (en progreso)
16:30 → ✅ EN CANCHA (todavía dentro de 2 horas)
17:00 → ✅ EN CANCHA (último minuto de la ventana)
17:01 → ❌ NO está en cancha (pasaron 2 horas)
```

**Diseño visual:**

```
┌─────────────────┐
│ ● EN CANCHA     │ ← Punto rojo parpadeando
└─────────────────┘
  ↑ Fondo rojo (#ef4444)
```

---

## 🎨 Integraciones Realizadas

### 1. Ranking (app/ranking/ranking-table.tsx)

**Cambios:**

#### A. Imports y Estado

```tsx
import { FiltrosCategorias } from "@/components/FiltrosCategorias";

export function RankingTable({ ranking }: RankingTableProps) {
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>("todas");
  const [filtroGenero, setFiltroGenero] = useState<FiltroGenero>("todos");
```

#### B. Cálculo de Conteos

```tsx
// Calcular conteos por categoría (considerando filtro de género)
const conteosPorCategoria = useMemo(() => {
  const conteos: Record<FiltroCategoria, number> = {
    todas: 0,
    "3ra": 0,
    "4ta": 0,
    "5ta": 0,
    Damas: 0,
  };

  ranking.forEach((jugador) => {
    const coincideGenero =
      filtroGenero === "todos" || jugador.genero === filtroGenero;
    
    if (coincideGenero) {
      conteos.todas++;
      conteos[jugador.categoria]++;
    }
  });

  return conteos;
}, [ranking, filtroGenero]);
```

#### C. UI Actualizada

**ANTES:**
```tsx
<div className="mb-4 flex flex-col gap-3 sm:flex-row">
  <div className="flex-1">
    <select>...</select> {/* Género */}
  </div>
  <div className="flex-1">
    <select>...</select> {/* Categoría */}
  </div>
</div>
```

**DESPUÉS:**
```tsx
<div className="mb-5 space-y-4">
  {/* Filtros de categoría (Pills) */}
  <div>
    <label>Categoría</label>
    <FiltrosCategorias
      categoriaActiva={filtroCategoria}
      onCambiarCategoria={setFiltroCategoria}
      conteos={conteosPorCategoria}
    />
  </div>

  {/* Filtro de género (dropdown) */}
  <div className="space-y-1.5">
    <label>Género</label>
    <select className="sm:max-w-xs">...</select>
  </div>
</div>
```

**Resultado:**
- ✅ Filtros de categoría tipo "pill" con conteos
- ✅ Filtro de género como selector (más compacto)
- ✅ Filtrado instantáneo sin recargar

---

### 2. Lo que viene (app/lo-que-viene/lo-que-viene-client.tsx)

**Cambios:**

#### A. Imports y Estado

```tsx
import { FiltrosCategorias } from "@/components/FiltrosCategorias";
import { BadgeEnCancha, estaEnCancha } from "@/components/BadgeEnCancha";

export function LoQueVieneClient() {
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaJugador | "todas">("todas");
  // ...
}
```

#### B. Filtrado y Conteos

```tsx
// Filtrar partidos por categoría
const partidosFiltrados = useMemo(() => {
  if (filtroCategoria === "todas") return partidos;
  return partidos.filter((partido) => partido.categoria === filtroCategoria);
}, [partidos, filtroCategoria]);

// Calcular conteos por categoría
const conteosPorCategoria = useMemo(() => {
  const conteos: Record<CategoriaJugador | "todas", number> = {
    todas: partidos.length,
    "3ra": 0,
    "4ta": 0,
    "5ta": 0,
    Damas: 0,
  };

  partidos.forEach((partido) => {
    if (partido.categoria) {
      conteos[partido.categoria]++;
    }
  });

  return conteos;
}, [partidos]);
```

#### C. UI con Filtros y Badge

```tsx
{pestana === "partidos" ? (
  <div className="space-y-6">
    {/* Filtros de categoría */}
    <div>
      <FiltrosCategorias
        categoriaActiva={filtroCategoria}
        onCambiarCategoria={setFiltroCategoria}
        conteos={conteosPorCategoria}
      />
    </div>

    {/* Partidos agrupados por día */}
    {partidosPorDia.map((grupo) => (
      <section key={grupo.fecha}>
        <h2>{formatFecha(grupo.fecha)}</h2>
        <div>
          {grupo.partidos.map((partido) => {
            const enCancha = estaEnCancha({
              fechaProgramada: partido.fecha_programada,
              estado: partido.estado,
            });

            return (
              <Link key={partido.id} href="...">
                {/* Jugadores y hora */}
                <div>
                  <p>{nombreEnAgenda(partido.jugador_1)} vs {nombreEnAgenda(partido.jugador_2)}</p>
                  <p>{formatFechaHorario(partido.fecha_programada)}</p>
                </div>
                
                {/* Badges */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {/* Badge EN CANCHA */}
                  {enCancha ? <BadgeEnCancha compacto /> : null}
                  
                  {/* Otros badges (cancha, torneo, categoría) */}
                  ...
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    ))}
  </div>
) : null}
```

**Resultado:**
- ✅ Filtros de categoría con conteos
- ✅ Badge "EN CANCHA" en partidos en progreso
- ✅ Mensaje cuando no hay partidos en la categoría filtrada

---

### 3. Árbol de Cruces (components/TarjetaPartidoTenis.tsx)

**Cambios:**

#### A. Imports

```tsx
import { BadgeEnCancha, estaEnCancha } from "@/components/BadgeEnCancha";
```

#### B. Componente BadgeProgramacion Actualizado

**ANTES:**
```tsx
function BadgeProgramacion({
  fecha,
  cancha,
}: {
  fecha: string | null;
  cancha: string | null;
}) {
  if (!fecha && !cancha) return null;
  return (
    <div>
      {fecha ? <span>🗓️ {formatProgramacionPartido(fecha)}</span> : null}
      {cancha ? <span>📍 {cancha}</span> : null}
    </div>
  );
}
```

**DESPUÉS:**
```tsx
function BadgeProgramacion({
  fecha,
  cancha,
  estado,
}: {
  fecha: string | null;
  cancha: string | null;
  estado: string;
}) {
  const enCancha = estaEnCancha({ fechaProgramada: fecha, estado });

  if (!fecha && !cancha && !enCancha) return null;
  
  return (
    <div className="flex items-center justify-between gap-2 ...">
      <div className="flex flex-wrap items-center gap-1">
        {fecha ? <span>🗓️ {formatProgramacionPartido(fecha)}</span> : null}
        {cancha ? <span>📍 {cancha}</span> : null}
      </div>
      
      {/* Badge EN CANCHA */}
      {enCancha ? <BadgeEnCancha compacto /> : null}
    </div>
  );
}
```

#### C. Uso Actualizado

```tsx
<BadgeProgramacion
  fecha={partido.fecha_programada}
  cancha={partido.cancha}
  estado={partido.estado} // ← NUEVO
/>
```

**Resultado:**
- ✅ Badge "EN CANCHA" visible en el árbol de cruces
- ✅ Se muestra junto a la fecha y cancha programada
- ✅ Destaca visualmente los partidos en progreso

---

## 🎨 Vista Previa Visual

### Filtros de Categoría (Ranking)

```
┌────────────────────────────────────────────────────┐
│ Categoría                                          │
│ ┌──────┬──────┬──────┬──────┬──────┐             │
│ │Todas │ 3ra  │ 4ta  │ 5ta  │ Damas│             │
│ │  45  │  12  │  15  │  10  │   8  │             │
│ └──────┴──────┴──────┴──────┴──────┘             │
│                                                    │
│ Género                                             │
│ [ Todos los géneros ▼ ]                           │
│                                                    │
│ ┌────────────────────────────────────────────┐   │
│ │ 1º  García Juan      3ra    180 pts       │   │
│ │ 2º  López María      Damas  165 pts       │   │
│ │ 3º  Fernández Carlos 4ta    150 pts       │   │
│ └────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

### Badge "EN CANCHA" (Lo que viene)

```
┌────────────────────────────────────────────────────┐
│ PRÓXIMOS PARTIDOS                                  │
│ ┌──────┬──────┬──────┬──────┬──────┐             │
│ │Todas │ 3ra  │ 4ta  │ 5ta  │ Damas│             │
│ └──────┴──────┴──────┴──────┴──────┘             │
│                                                    │
│ VIERNES 29/8                                       │
│                                                    │
│ ┌────────────────────────────────────────────┐   │
│ │ García vs López            15:00           │   │
│ │ ● EN CANCHA  📍 Cancha 1  🏆 Torneo Verano│   │
│ └────────────────────────────────────────────┘   │
│    ↑ Punto rojo parpadeando                       │
│                                                    │
│ ┌────────────────────────────────────────────┐   │
│ │ Fernández vs Martínez      17:00           │   │
│ │ 📍 Cancha 2  🏆 Torneo Verano  3ra         │   │
│ └────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

### Badge "EN CANCHA" (Árbol de Cruces)

```
┌─────────────────────────────────────────┐
│ Semifinal                               │
├─────────────────────────────────────────┤
│ 🗓️ Vie 15:00 | 📍 Cancha 1  ● EN CANCHA│
├─────────────────────────────────────────┤
│ García      6  6                     ✓  │
│ López       3  4                        │
└─────────────────────────────────────────┘
```

---

## 🚀 Ventajas del Sistema

### Filtros de Categoría (Pills):

1. ✅ **Visibilidad Inmediata**: Todas las opciones visibles sin abrir dropdown
2. ✅ **Conteos Claros**: Muestra cuántos items hay en cada categoría
3. ✅ **Filtrado Instantáneo**: Sin recarga de página
4. ✅ **Mobile-Friendly**: Scroll horizontal en móvil
5. ✅ **Visual Feedback**: Categoría activa claramente destacada

### Badge "EN CANCHA":

1. ✅ **Alta Visibilidad**: Color rojo con punto parpadeando
2. ✅ **Ubicuidad**: Aparece en todos los lugares relevantes (ranking, lo que viene, árbol)
3. ✅ **Precisión Temporal**: Ventana de 2 horas desde el inicio programado
4. ✅ **Automatización**: Se actualiza solo según la hora del sistema
5. ✅ **Contexto Claro**: Distingue fácilmente partidos en progreso vs finalizados vs programados

---

## 📊 Casos de Uso

### Caso 1: Usuario Busca su Partido

```
Usuario entra a "Lo que viene"
  ↓
Ve los filtros de categoría:
  ┌──────┬──────┬──────┬──────┬──────┐
  │Todas │ 3ra  │ 4ta  │ 5ta  │ Damas│
  │  45  │  12  │  15  │  10  │   8  │
  └──────┴──────┴──────┴──────┴──────┘
  ↓
Click en "4ta" → Filtra instantáneamente
  ↓
Ve su partido con badge "EN CANCHA"
  ┌────────────────────────────────────┐
  │ Usuario vs Rival    15:30          │
  │ ● EN CANCHA  📍 Cancha 2           │
  └────────────────────────────────────┘
  ↓
Sabe que tiene que ir YA a la cancha
```

### Caso 2: Espectador Quiere Ver un Partido

```
Espectador entra a "Torneos" → Árbol de cruces
  ↓
Ve las llaves con varios partidos
  ↓
Identifica rápidamente el partido en progreso:
  ┌─────────────────────────────────────┐
  │ Final                               │
  ├─────────────────────────────────────┤
  │ 🗓️ Sáb 16:00 | 📍 Cancha 1  ● EN CANCHA│
  ├─────────────────────────────────────┤
  │ Finalista 1   6  5                  │
  │ Finalista 2   4  3                  │
  └─────────────────────────────────────┘
  ↓
Sabe exactamente qué partido está jugándose AHORA
```

### Caso 3: Admin Revisa el Ranking

```
Admin entra a "Ranking"
  ↓
Ve los filtros de categoría con conteos:
  ┌──────┬──────┬──────┬──────┬──────┐
  │Todas │ 3ra  │ 4ta  │ 5ta  │ Damas│
  │  45  │  12  │  15  │  10  │   8  │
  └──────┴──────┴──────┴──────┴──────┘
  ↓
Ve de un vistazo que:
  - Hay 12 jugadores en 3ra
  - 15 en 4ta
  - 10 en 5ta
  - 8 en Damas
  ↓
Click en "Damas" → Ve el ranking filtrado
  ↓
Puede analizar rápidamente la categoría específica
```

---

## 📝 Archivos Modificados/Creados

### Archivos Creados:
- ✅ `components/FiltrosCategorias.tsx` (filtros tipo pill)
- ✅ `components/BadgeEnCancha.tsx` (badge + lógica temporal)

### Archivos Modificados:
- ✅ `app/ranking/ranking-table.tsx` (integración filtros)
- ✅ `app/lo-que-viene/lo-que-viene-client.tsx` (filtros + badge)
- ✅ `components/TarjetaPartidoTenis.tsx` (badge en árbol de cruces)

---

## 🧪 Testing Sugerido

### 1. Testing de Filtros de Categoría

```bash
# Ranking
1. Ir a /ranking
2. Ver filtros tipo pill arriba de la tabla
3. Ver conteos en cada categoría
4. Click en "3ra" → Ver solo jugadores de 3ra
5. Click en "Damas" → Ver solo jugadoras de Damas
6. Click en "Todas" → Ver todos los jugadores
7. Verificar que el filtro de género funciona junto con categoría

# Lo que viene
1. Ir a /lo-que-viene
2. Pestaña "Próximos Partidos"
3. Ver filtros tipo pill
4. Click en una categoría → Ver solo partidos de esa categoría
5. Verificar mensaje cuando no hay partidos en la categoría
```

### 2. Testing de Badge "EN CANCHA"

```bash
# Simulación de partido en progreso
1. Crear un partido de prueba programado para HOY a la hora actual
2. Esperar unos minutos (o ajustar hora del sistema)
3. Verificar badge "EN CANCHA" en:
   - Página "Lo que viene"
   - Árbol de cruces del torneo
4. Verificar que el punto rojo está parpadeando
5. Ajustar hora del sistema 2 horas después
6. Verificar que el badge desaparece

# Verificación de lógica
- Partido ayer → ❌ No muestra badge
- Partido hoy pero 3 horas antes → ❌ No muestra badge
- Partido hoy a la hora exacta → ✅ Muestra badge
- Partido hoy hace 1 hora → ✅ Muestra badge
- Partido hoy hace 2 horas → ❌ No muestra badge (ventana cerrada)
- Partido finalizado → ❌ No muestra badge
```

### 3. Testing Responsive (Móvil)

```bash
1. Abrir en móvil o DevTools modo móvil
2. Verificar que los filtros de categoría tienen scroll horizontal
3. Verificar que todos los pills son visibles
4. Verificar que el badge "EN CANCHA" se ve correctamente compacto
5. Verificar que no rompe el layout en pantallas pequeñas
```

---

## ✅ Estado Final

**Filtros de Categoría:**
- ✅ Componente reutilizable `FiltrosCategorias`
- ✅ Integrado en Ranking
- ✅ Integrado en "Lo que viene"
- ✅ Con conteos dinámicos
- ✅ Filtrado instantáneo sin recarga

**Badge "EN CANCHA":**
- ✅ Componente reutilizable `BadgeEnCancha`
- ✅ Función de validación temporal `estaEnCancha`
- ✅ Integrado en "Lo que viene"
- ✅ Integrado en Árbol de Cruces
- ✅ Animación de punto parpadeando
- ✅ Ventana de 2 horas desde inicio programado

**¡Sistema completo y listo para producción!** 🚀

---

**Implementado por:** Senior Frontend & UI/UX Expert  
**Fecha:** 2026-08-28
