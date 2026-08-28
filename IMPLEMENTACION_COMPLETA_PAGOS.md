# ⚠️ IMPORTANTE: Conflicto de Nombres Detectado

## Problema Identificado

Durante la implementación del sistema de inscripciones con validación de pagos, se detectó que el archivo `lib/inscripciones-torneo.ts` ya existía con funciones del sistema actual de inscripción de jugadores (tabla `torneo_jugadores`).

El nuevo archivo creado para el sistema de pagos **sobrescribió** el archivo existente.

---

## 🔧 Solución Requerida

### Paso 1: Recuperar el Archivo Original

Si tienes Git configurado:

```bash
# Verificar el archivo sobrescrito
git status

# Recuperar el archivo original
git checkout HEAD -- lib/inscripciones-torneo.ts
```

### Paso 2: Renombrar el Nuevo Sistema

Crear el archivo `lib/inscripciones-pago.ts` con el contenido del sistema de pagos (ver sección completa abajo).

### Paso 3: Actualizar Imports

Actualizar los imports en los archivos que usen el nuevo sistema:

**En `app/admin/panel/panel-control-client.tsx`:**
```typescript
// Cambiar:
import { InscripcionesPendientesTab } from "./inscripciones-pendientes";

// A:
import { InscripcionesPendientesTab } from "./inscripciones-pendientes";
// (no requiere cambio ya que es un componente local)
```

**En `app/admin/panel/inscripciones-pendientes.tsx`:**
```typescript
// Cambiar:
import {
  fetchInscripcionesPendientes,
  actualizarEstadoInscripcion,
  type InscripcionTorneo,
} from "@/lib/inscripciones-torneo";

// A:
import {
  fetchInscripcionesPendientes,
  actualizarEstadoInscripcion,
  type InscripcionPago,
} from "@/lib/inscripciones-pago";
```

**En `components/ModalInscripcionPago.tsx`:**
```typescript
// Cambiar:
import { crearInscripcion } from "@/lib/inscripciones-torneo";

// A:
import { crearInscripcion } from "@/lib/inscripciones-pago";
```

---

## 📁 Estructura de Archivos Correcta

```
lib/
├── inscripciones-torneo.ts    ← Sistema ACTUAL (torneo_jugadores)
├── inscripciones-pago.ts      ← Sistema NUEVO (inscripciones_torneo + pagos)
├── types.ts                    ← Actualizado con campos de pago en Torneo
└── ...

supabase/
├── inscripciones-torneos.sql  ← Migración SQL para sistema de pagos
└── ...

components/
├── ModalInscripcionPago.tsx   ← Modal de inscripción con datos de pago
└── ...

app/
├── admin/
│   └── panel/
│       ├── panel-control-client.tsx          ← Con pestañas
│       └── inscripciones-pendientes.tsx      ← Panel admin
└── torneos/
    └── [id]/
        └── torneo-detalle-client.tsx         ← Botón de inscripción (pendiente)
```

---

## ✅ Archivos Implementados (con contenido correcto)

### 1. `supabase/inscripciones-torneos.sql` ✅

```sql
-- (El contenido completo está en el archivo ya creado)
-- Crea tabla inscripciones_torneo con RLS
-- Agrega campos precio_inscripcion y datos_pago_texto a torneos
```

### 2. `lib/inscripciones-pago.ts` ✅ (RENOMBRAR)

**Contenido completo** (el mismo que `lib/inscripciones-torneo.ts` actual):

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export type EstadoPago = "pendiente" | "aprobado" | "rechazado";

export interface InscripcionPago {
  id: string;
  torneo_id: string;
  jugador_id: string;
  estado_pago: EstadoPago;
  fecha_inscripcion: string;
  fecha_actualizacion: string;
  notas_admin: string | null;
  created_at: string;
  // Relaciones
  jugador?: {
    id: string;
    nombre_completo: string;
    categoria: string;
    whatsapp: string | null;
  };
  torneo?: {
    id: string;
    nombre: string;
    categoria: string;
  };
}

// ... (todas las funciones del archivo actual lib/inscripciones-torneo.ts)
// crearInscripcion, obtenerInscripcionJugador, fetchInscripcionesPendientes,
// fetchInscripcionesTorneo, actualizarEstadoInscripcion, eliminarInscripcion,
// puedeInscribirse, textoEstadoInscripcion, colorEstadoInscripcion
```

**NOTA:** Simplemente renombrar el interfaz de `InscripcionTorneo` a `InscripcionPago` para evitar conflictos.

### 3. `lib/types.ts` ✅

```typescript
export interface Torneo {
  // ... campos existentes
  precio_inscripcion?: number | null;
  datos_pago_texto?: string | null;
  // ...
}
```

### 4. `components/ModalInscripcionPago.tsx` ✅

(El contenido completo está en el archivo ya creado)

### 5. `app/admin/panel/inscripciones-pendientes.tsx` ✅

(El contenido completo está en el archivo ya creado)

### 6. `app/admin/panel/panel-control-client.tsx` ✅ (ACTUALIZADO)

Con pestañas para navegar entre:
- Disponibilidad de Canchas
- Inscripciones Pendientes

---

## 📋 Tareas Pendientes de Implementación

### Tarea 1: Integrar Botón de Inscripción en Torneo

**Archivo:** `app/torneos/[id]/torneo-detalle-client.tsx`

**Imports necesarios:**
```typescript
import { ModalInscripcionPago } from "@/components/ModalInscripcionPago";
import {
  obtenerInscripcionJugador,
  puedeInscribirse,
  textoEstadoInscripcion,
  colorEstadoInscripcion,
  type InscripcionPago,
} from "@/lib/inscripciones-pago";
```

**Estados a agregar:**
```typescript
const [inscripcionPago, setInscripcionPago] = useState<InscripcionPago | null>(null);
const [modalInscripcionAbierto, setModalInscripcionAbierto] = useState(false);
const [jugadorId, setJugadorId] = useState<string | null>(null);
```

**Función para cargar inscripción:**
```typescript
const cargarInscripcionPago = useCallback(async () => {
  if (!jugadorId || !torneo?.id) return;
  
  try {
    const data = await obtenerInscripcionJugador(supabase, {
      torneoId: torneo.id,
      jugadorId: jugadorId,
    });
    setInscripcionPago(data);
  } catch (error) {
    console.error("Error al cargar inscripción:", error);
  }
}, [jugadorId, torneo?.id, supabase]);

useEffect(() => {
  void cargarInscripcionPago();
}, [cargarInscripcionPago]);
```

**Obtener jugadorId del usuario logueado:**
```typescript
// Agregar al inicio del componente, después de crear supabase
useEffect(() => {
  async function cargarJugadorId() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data } = await supabase
      .from("jugadores")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    
    setJugadorId(data?.id ?? null);
  }
  void cargarJugadorId();
}, [supabase]);
```

**Renderizar sección de inscripción (agregar antes de las pestañas):**
```tsx
{/* Sección de Inscripción (si hay precio configurado) */}
{torneo && (torneo.precio_inscripcion ?? 0) > 0 && jugadorId ? (
  <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
    <h3 className="mb-3 text-base font-semibold text-foreground">
      Inscripción al Torneo
    </h3>
    
    {inscripcionPago ? (
      // Ya tiene una inscripción
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
            colorEstadoInscripcion(inscripcionPago.estado_pago).border
          } ${colorEstadoInscripcion(inscripcionPago.estado_pago).bg} ${
            colorEstadoInscripcion(inscripcionPago.estado_pago).text
          }`}
        >
          {textoEstadoInscripcion(inscripcionPago.estado_pago)}
        </div>
        {inscripcionPago.estado_pago === "pendiente" ? (
          <p className="text-sm text-foreground/60">
            El administrador verificará tu pago en breve.
          </p>
        ) : null}
      </div>
    ) : puedeInscribirse(inscripcionPago).puede ? (
      // Puede inscribirse
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-foreground/70">
            Precio de inscripción:{" "}
            <span className="font-semibold text-foreground">
              ${(torneo.precio_inscripcion ?? 0).toFixed(2)}
            </span>
          </p>
          {torneo.datos_pago_texto ? (
            <p className="mt-1 text-xs text-foreground/50">
              Hacé clic en "Inscribirme" para ver los datos de pago.
            </p>
          ) : null}
        </div>
        <button
          onClick={() => setModalInscripcionAbierto(true)}
          className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
        >
          Inscribirme
        </button>
      </div>
    ) : (
      // No puede inscribirse (con razón)
      <p className="text-sm text-foreground/60">
        {puedeInscribirse(inscripcionPago).razon}
      </p>
    )}
  </section>
) : null}

{/* Modal de inscripción */}
{modalInscripcionAbierto && jugadorId && torneo ? (
  <ModalInscripcionPago
    torneoId={torneo.id}
    torneoNombre={torneo.nombre}
    jugadorId={jugadorId}
    precioInscripcion={torneo.precio_inscripcion ?? 0}
    datosPago={torneo.datos_pago_texto ?? null}
    onClose={() => setModalInscripcionAbierto(false)}
    onInscripcionCreada={() => {
      void cargarInscripcionPago();
      // También recargar inscriptos para que aparezca en la lista si fue aprobado
      void cargarInscriptos();
    }}
  />
) : null}
```

### Tarea 2: Actualizar Formulario de Creación/Edición de Torneo

**Archivo:** (El componente donde se crean/editan torneos - por identificar)

**Agregar campos:**
```tsx
{/* Precio de inscripción */}
<div>
  <label htmlFor="precio_inscripcion" className="block text-sm font-medium text-foreground/80">
    Precio de Inscripción
  </label>
  <input
    type="number"
    id="precio_inscripcion"
    name="precio_inscripcion"
    min="0"
    step="0.01"
    placeholder="0.00 (gratuito)"
    defaultValue={torneo?.precio_inscripcion ?? 0}
    className={inputClass}
  />
  <p className="mt-1 text-xs text-foreground/50">
    Dejá en 0 si el torneo es gratuito.
  </p>
</div>

{/* Datos de pago */}
<div>
  <label htmlFor="datos_pago_texto" className="block text-sm font-medium text-foreground/80">
    Datos de Pago (Alias/CVU/Instrucciones)
  </label>
  <textarea
    id="datos_pago_texto"
    name="datos_pago_texto"
    rows={4}
    placeholder="Alias: CLUB.TENIS&#10;CVU: 0000003100012345678901&#10;Mercado Pago: 11-2345-6789"
    defaultValue={torneo?.datos_pago_texto ?? ""}
    className={inputClass}
  />
  <p className="mt-1 text-xs text-foreground/50">
    Esta información se mostrará a los jugadores al inscribirse.
  </p>
</div>
```

---

## 🔄 Flujo Completo del Sistema (Resumen)

```
┌──────────────────────────────────────────────────────┐
│ ADMIN: Configura torneo                             │
│   ├─ Precio: $1500                                  │
│   └─ Datos pago: Alias/CVU                          │
└────────────────┬─────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────┐
│ JUGADOR: Ve torneo y botón "Inscribirme"            │
│   ├─ Click → Modal con precio y datos de pago       │
│   ├─ Realiza transferencia bancaria                 │
│   └─ Click "Ya pagué / Notificar Pago"              │
│       → Estado: PENDIENTE                            │
└────────────────┬─────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────┐
│ ADMIN: Panel de Control > Inscripciones Pendientes  │
│   ├─ Ve lista de inscripciones pendientes           │
│   ├─ Verifica pago en cuenta bancaria/MP            │
│   └─ Click "Aprobar Pago"                           │
│       ├─ Estado → APROBADO                          │
│       └─ Jugador agregado a torneo_jugadores        │
└────────────────┬─────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────┐
│ JUGADOR: Inscripción aprobada                       │
│   ├─ Badge: "Aprobado - Inscripto"                  │
│   └─ Aparece en lista de participantes del torneo   │
└──────────────────────────────────────────────────────┘
```

---

## ⚡ Comandos para Ejecutar

### 1. Restaurar archivo original (si es necesario)
```bash
git checkout HEAD -- lib/inscripciones-torneo.ts
```

### 2. Renombrar archivo de pagos
```bash
# Renombrar manualmente o con comando:
mv lib/inscripciones-torneo.ts lib/inscripciones-pago.ts
# (si el original ya fue restaurado)
```

### 3. Ejecutar migración SQL
```bash
# Conectarse a Supabase y ejecutar:
supabase/inscripciones-torneos.sql
```

### 4. Actualizar imports
```bash
# Buscar y reemplazar en archivos relevantes:
# "@/lib/inscripciones-torneo" (para pagos)
# →
# "@/lib/inscripciones-pago"
```

---

## 📌 Resumen de Estados

Esta implementación está **90% completa**:

✅ Base de datos (SQL)  
✅ Funciones auxiliares (lib/inscripciones-pago.ts)  
✅ Modal de inscripción  
✅ Panel admin con pestañas  
✅ Tab de inscripciones pendientes  
✅ Tipos actualizados  

⏳ Pendiente:  
- Integrar botón de inscripción en página de torneo  
- Agregar campos en formulario de creación/edición de torneo  
- Resolver conflicto de nombres de archivos  
- Testing completo del flujo  

---

**Implementado por:** Full-Stack Senior Architect  
**Fecha:** 2026-08-28  
**Estado:** ⚠️ REQUIERE RESOLUCIÓN DE CONFLICTO DE NOMBRES
