import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarCorreoInscripcionConfirmada } from "@/lib/email/inscripcion-confirmada";
import { createAdminClient } from "@/lib/supabase/admin";
import { actualizarEstadoInscripcion } from "@/lib/inscripciones-pago";

export interface ResultadoAprobacionInscripcion {
  yaInscritoEnTorneo: boolean;
  nombreJugador: string;
  correoEnviado: boolean;
  errorCorreo?: string;
}

async function obtenerEmailJugador(
  supabaseAdmin: SupabaseClient,
  jugadorId: string
): Promise<string | null> {
  const { data: jugador, error } = await supabaseAdmin
    .from("jugadores")
    .select("user_id")
    .eq("id", jugadorId)
    .maybeSingle();

  if (error || !jugador?.user_id) return null;

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.getUserById(jugador.user_id);

  if (authError || !authData.user?.email) return null;
  return authData.user.email;
}

export async function aprobarInscripcionConNotificacion(
  supabase: SupabaseClient,
  inscripcionId: string
): Promise<ResultadoAprobacionInscripcion> {
  const { data: inscripcion, error: errorFetch } = await supabase
    .from("inscripciones_torneo")
    .select(
      `
      id,
      torneo_id,
      jugador_id,
      estado_pago,
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
    .eq("id", inscripcionId)
    .maybeSingle();

  if (errorFetch) {
    throw new Error(errorFetch.message);
  }
  if (!inscripcion) {
    throw new Error("No se encontró la inscripción.");
  }

  const jugadorRaw = inscripcion.jugador as
    | { id: string; nombre_completo: string; categoria: string }
    | { id: string; nombre_completo: string; categoria: string }[]
    | null;
  const torneoRaw = inscripcion.torneo as
    | { id: string; nombre: string }
    | { id: string; nombre: string }[]
    | null;

  const jugador = Array.isArray(jugadorRaw) ? jugadorRaw[0] : jugadorRaw;
  const torneo = Array.isArray(torneoRaw) ? torneoRaw[0] : torneoRaw;

  if (!jugador || !torneo) {
    throw new Error("No se pudieron cargar los datos del jugador o del torneo.");
  }

  await actualizarEstadoInscripcion(supabase, {
    inscripcionId,
    estado: "aprobado",
  });

  const { data: yaInscrito } = await supabase
    .from("torneo_jugadores")
    .select("id")
    .eq("torneo_id", inscripcion.torneo_id)
    .eq("jugador_id", inscripcion.jugador_id)
    .maybeSingle();

  if (!yaInscrito) {
    const categoriaJugador = jugador.categoria || "3ra";
    const { error: errorInscripcion } = await supabase
      .from("torneo_jugadores")
      .insert({
        torneo_id: inscripcion.torneo_id,
        jugador_id: inscripcion.jugador_id,
        categoria: categoriaJugador,
        clasificado: false,
      });

    if (errorInscripcion) {
      throw new Error(errorInscripcion.message);
    }
  }

  let correoEnviado = false;
  let errorCorreo: string | undefined;

  try {
    const supabaseAdmin = createAdminClient();
    const emailDestino = await obtenerEmailJugador(
      supabaseAdmin,
      inscripcion.jugador_id
    );

    if (!emailDestino) {
      errorCorreo =
        "No se encontró un correo vinculado a la ficha del jugador.";
    } else {
      const resultadoCorreo = await enviarCorreoInscripcionConfirmada({
        emailDestino,
        nombreJugador: jugador.nombre_completo,
        nombreTorneo: torneo.nombre,
      });

      if (resultadoCorreo.ok) {
        correoEnviado = true;
      } else {
        errorCorreo = resultadoCorreo.error;
        console.error(
          "No se pudo enviar el correo de inscripción confirmada:",
          resultadoCorreo.error
        );
      }
    }
  } catch (error) {
    errorCorreo =
      error instanceof Error
        ? error.message
        : "Error al intentar enviar el correo.";
    console.error("Fallo el envío de correo de inscripción:", error);
  }

  return {
    yaInscritoEnTorneo: Boolean(yaInscrito),
    nombreJugador: jugador.nombre_completo,
    correoEnviado,
    errorCorreo,
  };
}
