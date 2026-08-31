import type { SupabaseClient } from "@supabase/supabase-js";
import type { MedioPagoInscripcion } from "@/lib/inscripciones-precio";

export type EstadoPago = "pendiente" | "aprobado" | "rechazado";

export interface InscripcionPago {
  id: string;
  torneo_id: string;
  jugador_id: string;
  estado_pago: EstadoPago;
  fecha_inscripcion: string;
  fecha_actualizacion: string;
  notas_admin: string | null;
  titular_pago: string | null;
  medio_pago: MedioPagoInscripcion;
  created_at: string;
  // Relaciones
  jugador?: {
    id: string;
    nombre_completo: string;
    categoria: string;
  };
  torneo?: {
    id: string;
    nombre: string;
  };
}

/**
 * Crea una nueva inscripción a un torneo (estado: pendiente).
 */
export async function crearInscripcion(
  supabase: SupabaseClient,
  params: {
    torneoId: string;
    jugadorId: string;
    medioPago: MedioPagoInscripcion;
    titularPago?: string | null;
  }
): Promise<void> {
  const medioPago = params.medioPago;
  const titularPago = params.titularPago?.trim() ?? "";

  if (medioPago === "transferencia" && !titularPago) {
    throw new Error("Indicá el titular de la cuenta desde la que transferiste.");
  }

  const { error } = await supabase.from("inscripciones_torneo").insert({
    torneo_id: params.torneoId,
    jugador_id: params.jugadorId,
    estado_pago: "pendiente",
    medio_pago: medioPago,
    titular_pago: medioPago === "transferencia" ? titularPago : null,
  });

  if (error) {
    if (error.code === "23505") {
      // Unique constraint violation
      throw new Error("Ya existe una inscripción para este torneo.");
    }
    throw new Error(error.message || "No se pudo crear la inscripción.");
  }
}

/**
 * Obtiene la inscripción de un jugador en un torneo específico.
 */
export async function obtenerInscripcionJugador(
  supabase: SupabaseClient,
  params: {
    torneoId: string;
    jugadorId: string;
  }
): Promise<InscripcionPago | null> {
  const { data, error } = await supabase
    .from("inscripciones_torneo")
    .select("*")
    .eq("torneo_id", params.torneoId)
    .eq("jugador_id", params.jugadorId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as InscripcionPago | null;
}

/**
 * Obtiene todas las inscripciones pendientes de validación (solo admins).
 */
export async function fetchInscripcionesPendientes(
  supabase: SupabaseClient
): Promise<InscripcionPago[]> {
  const { data, error } = await supabase
    .from("inscripciones_torneo")
    .select(
      `
      id,
      torneo_id,
      jugador_id,
      estado_pago,
      fecha_inscripcion,
      fecha_actualizacion,
      notas_admin,
      titular_pago,
      medio_pago,
      created_at,
      jugador:jugador_id (
        id,
        nombre_completo,
        categoria
      ),
      torneo:torneo_id (
        id,
        nombre
      )
    `
    )
    .eq("estado_pago", "pendiente")
    .order("fecha_inscripcion", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as unknown as InscripcionPago[]) ?? [];
}

/**
 * Obtiene todas las inscripciones de un torneo (con filtros opcionales).
 */
export async function fetchInscripcionesTorneo(
  supabase: SupabaseClient,
  params: {
    torneoId: string;
    estado?: EstadoPago;
  }
): Promise<InscripcionPago[]> {
  let query = supabase
    .from("inscripciones_torneo")
    .select(
      `
      id,
      torneo_id,
      jugador_id,
      estado_pago,
      fecha_inscripcion,
      fecha_actualizacion,
      notas_admin,
      titular_pago,
      medio_pago,
      created_at,
      jugador:jugador_id (
        id,
        nombre_completo,
        categoria
      )
    `
    )
    .eq("torneo_id", params.torneoId);

  if (params.estado) {
    query = query.eq("estado_pago", params.estado);
  }

  query = query.order("fecha_inscripcion", { ascending: false });

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return (data as unknown as InscripcionPago[]) ?? [];
}

/**
 * Actualiza el estado de una inscripción (solo admins).
 */
export async function actualizarEstadoInscripcion(
  supabase: SupabaseClient,
  params: {
    inscripcionId: string;
    estado: EstadoPago;
    notasAdmin?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from("inscripciones_torneo")
    .update({
      estado_pago: params.estado,
      notas_admin: params.notasAdmin || null,
    })
    .eq("id", params.inscripcionId);

  if (error) throw new Error(error.message || "No se pudo actualizar la inscripción.");
}

/**
 * Elimina una inscripción (solo admins).
 */
export async function eliminarInscripcion(
  supabase: SupabaseClient,
  inscripcionId: string
): Promise<void> {
  const { error } = await supabase
    .from("inscripciones_torneo")
    .delete()
    .eq("id", inscripcionId);

  if (error) throw new Error(error.message || "No se pudo eliminar la inscripción.");
}

/**
 * Verifica si un jugador puede inscribirse a un torneo.
 */
export function puedeInscribirse(inscripcion: InscripcionPago | null): {
  puede: boolean;
  razon?: string;
} {
  if (!inscripcion) {
    return { puede: true };
  }

  if (inscripcion.estado_pago === "aprobado") {
    return { puede: false, razon: "Ya estás inscripto en este torneo." };
  }

  if (inscripcion.estado_pago === "pendiente") {
    return {
      puede: false,
      razon: "Tu inscripción está pendiente de validación de pago.",
    };
  }

  if (inscripcion.estado_pago === "rechazado") {
    return {
      puede: true, // Puede intentar inscribirse nuevamente
    };
  }

  return { puede: true };
}

/**
 * Obtiene el texto de estado para mostrar al usuario.
 */
export function textoEstadoInscripcion(estado: EstadoPago): string {
  switch (estado) {
    case "pendiente":
      return "Pendiente de validación";
    case "aprobado":
      return "Aprobado - Inscripto";
    case "rechazado":
      return "Rechazado";
    default:
      return estado;
  }
}

/**
 * Obtiene el color del badge según el estado.
 */
export function colorEstadoInscripcion(estado: EstadoPago): {
  bg: string;
  text: string;
  border: string;
} {
  switch (estado) {
    case "pendiente":
      return {
        bg: "bg-yellow-500/10",
        text: "text-yellow-500",
        border: "border-yellow-500/30",
      };
    case "aprobado":
      return {
        bg: "bg-green-500/10",
        text: "text-green-500",
        border: "border-green-500/30",
      };
    case "rechazado":
      return {
        bg: "bg-red-500/10",
        text: "text-red-500",
        border: "border-red-500/30",
      };
    default:
      return {
        bg: "bg-foreground/10",
        text: "text-foreground",
        border: "border-border",
      };
  }
}
