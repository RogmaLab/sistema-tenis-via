import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarCorreoInscripcionConfirmada } from "@/lib/email/inscripcion-confirmada";
import { createAdminClient } from "@/lib/supabase/admin";
import { actualizarEstadoInscripcion } from "@/lib/inscripciones-pago";
import { formatearNombre } from "@/lib/nombre";

export interface ResultadoAprobacionInscripcion {
  yaInscritoEnTorneo: boolean;
  /** False si el pago se aprobó pero la ficha no está entre las categorías del torneo. */
  cuadroAsignado: boolean;
  nombreJugador: string;
  correoEnviado: boolean;
  errorCorreo?: string;
}

type JugadorAprobacion = {
  id: string;
  nombre_completo: string;
  categoria: string;
};

type TorneoAprobacion = {
  id: string;
  nombre: string;
  categorias: string[] | null;
};

function categoriasHabilitadas(categorias: string[] | null | undefined): string[] {
  return (categorias ?? [])
    .map((categoria) => categoria.trim())
    .filter((categoria) => categoria.length > 0);
}

function fichaEstaEnTorneo(
  categoriaFicha: string | null | undefined,
  categoriasTorneo: string[] | null | undefined
): boolean {
  const ficha = (categoriaFicha ?? "").trim();
  if (!ficha) return false;
  return categoriasHabilitadas(categoriasTorneo).includes(ficha);
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
        nombre,
        categorias
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
    | JugadorAprobacion
    | JugadorAprobacion[]
    | null;
  const torneoRaw = inscripcion.torneo as
    | TorneoAprobacion
    | TorneoAprobacion[]
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

  const { data: yaInscrito, error: errorYaInscrito } = await supabase
    .from("torneo_jugadores")
    .select("id")
    .eq("torneo_id", inscripcion.torneo_id)
    .eq("jugador_id", inscripcion.jugador_id)
    .maybeSingle();

  if (errorYaInscrito) {
    throw new Error(errorYaInscrito.message);
  }

  const fichaHabilitada = fichaEstaEnTorneo(
    jugador.categoria,
    torneo.categorias
  );
  let cuadroAsignado = Boolean(yaInscrito);

  if (!yaInscrito && fichaHabilitada) {
    const categoriaFicha = jugador.categoria.trim();
    const { error: errorInscripcion } = await supabase
      .from("torneo_jugadores")
      .insert({
        torneo_id: inscripcion.torneo_id,
        jugador_id: inscripcion.jugador_id,
        categoria: categoriaFicha,
        clasificado: false,
      });

    if (errorInscripcion) {
      throw new Error(errorInscripcion.message);
    }
    cuadroAsignado = true;
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
        nombreJugador: formatearNombre(jugador.nombre_completo),
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
    cuadroAsignado,
    nombreJugador: formatearNombre(jugador.nombre_completo),
    correoEnviado,
    errorCorreo,
  };
}
