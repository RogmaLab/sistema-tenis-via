import { createClient } from "@/lib/supabase/client";
import { esJugadorHumano } from "@/lib/motor-ranking";

export interface InscripcionVigente {
  torneo_id: string;
  jugador_id: string;
  categoria: string;
}

interface PartidoConJugadoresIds {
  torneo_id: string;
  categoria: string | null;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
}

export interface SlotsRetirados {
  j1Fuera: boolean;
  j2Fuera: boolean;
  hayQueLimpiar: boolean;
}

function categoriaCubrePartido(
  categoriaPartido: string | null | undefined,
  categoriaInscripcion: string
) {
  const delPartido = (categoriaPartido ?? "").trim();
  if (!delPartido) return true;
  return delPartido === categoriaInscripcion.trim();
}

export function jugadorSigueInscripto(
  inscripciones: InscripcionVigente[],
  params: {
    torneoId: string;
    jugadorId: string | null | undefined;
    categoria: string | null | undefined;
  }
) {
  if (!esJugadorHumano(params.jugadorId)) return true;
  return inscripciones.some(
    (fila) =>
      fila.torneo_id === params.torneoId &&
      fila.jugador_id === params.jugadorId &&
      categoriaCubrePartido(params.categoria, fila.categoria ?? "")
  );
}

export function slotsRetirados(
  partido: PartidoConJugadoresIds,
  inscripciones: InscripcionVigente[]
): SlotsRetirados {
  const base = {
    torneoId: partido.torneo_id,
    categoria: partido.categoria,
  };
  const j1Fuera =
    esJugadorHumano(partido.jugador_1_id) &&
    !jugadorSigueInscripto(inscripciones, {
      ...base,
      jugadorId: partido.jugador_1_id,
    });
  const j2Fuera =
    esJugadorHumano(partido.jugador_2_id) &&
    !jugadorSigueInscripto(inscripciones, {
      ...base,
      jugadorId: partido.jugador_2_id,
    });
  return { j1Fuera, j2Fuera, hayQueLimpiar: j1Fuera || j2Fuera };
}

export function partidoTieneJugadorRetirado(
  partido: PartidoConJugadoresIds,
  inscripciones: InscripcionVigente[]
) {
  return slotsRetirados(partido, inscripciones).hayQueLimpiar;
}

/** Saca de la vista a quien ya no está inscripto y libera el horario. */
export function ocultarRetiradosEnPartido<
  T extends {
    estado: string;
    categoria: string | null;
    fecha_programada: string | null;
    cancha: string | null;
    jugador_1: { id: string } | null;
    jugador_2: { id: string } | null;
  },
>(partido: T, torneoId: string, inscripciones: InscripcionVigente[]): T {
  if (partido.estado === "Finalizado") return partido;
  const slots = slotsRetirados(
    {
      torneo_id: torneoId,
      categoria: partido.categoria,
      jugador_1_id: partido.jugador_1?.id ?? null,
      jugador_2_id: partido.jugador_2?.id ?? null,
    },
    inscripciones
  );
  if (!slots.hayQueLimpiar) return partido;
  return {
    ...partido,
    fecha_programada: null,
    cancha: null,
    jugador_1: slots.j1Fuera ? null : partido.jugador_1,
    jugador_2: slots.j2Fuera ? null : partido.jugador_2,
  };
}

const PARCHE_SIN_HORARIO = {
  fecha_programada: null,
  cancha: null,
  suspendido_lluvia: false,
};

async function limpiarPartidoPendiente(
  partidoId: string,
  slots: Pick<SlotsRetirados, "j1Fuera" | "j2Fuera">
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("partidos")
    .update({
      ...(slots.j1Fuera ? { jugador_1_id: null } : {}),
      ...(slots.j2Fuera ? { jugador_2_id: null } : {}),
      ...PARCHE_SIN_HORARIO,
    })
    .eq("id", partidoId)
    .neq("estado", "Finalizado")
    .select("id");

  if (error) {
    throw new Error(`No se pudo actualizar el partido: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

/**
 * Baja la inscripción y saca al jugador de los partidos de esa categoría
 * que todavía no se jugaron, incluida la programación (día, hora y cancha).
 */
export async function quitarJugadorDelTorneo(params: {
  inscripcionId: string;
  torneoId: string;
  jugadorId: string;
  categoria: string;
}): Promise<void> {
  const supabase = createClient();
  const categoria = params.categoria.trim();

  const { data: partidos, error: errorPartidos } = await supabase
    .from("partidos")
    .select("id, categoria, estado, jugador_1_id, jugador_2_id")
    .eq("torneo_id", params.torneoId)
    .neq("estado", "Finalizado")
    .or(
      `jugador_1_id.eq.${params.jugadorId},jugador_2_id.eq.${params.jugadorId}`
    );

  if (errorPartidos) {
    throw new Error(
      `No se pudieron leer los partidos del jugador: ${errorPartidos.message}`
    );
  }

  for (const partido of partidos ?? []) {
    const catPartido = (partido.categoria ?? "").trim();
    if (categoria && catPartido && catPartido !== categoria) continue;
    const j1Fuera = partido.jugador_1_id === params.jugadorId;
    const j2Fuera = partido.jugador_2_id === params.jugadorId;
    if (!j1Fuera && !j2Fuera) continue;
    await limpiarPartidoPendiente(partido.id, { j1Fuera, j2Fuera });
  }

  const { error } = await supabase
    .from("torneo_jugadores")
    .delete()
    .eq("id", params.inscripcionId);

  if (error) {
    throw new Error(`No se pudo quitar la inscripción: ${error.message}`);
  }
}

/**
 * Corrige partidos pendientes que todavía nombran a alguien que ya no está
 * inscripto en esa categoría. Libera el horario para que no siga en la agenda.
 */
export async function sanearPartidosPendientesSinInscripcion(
  torneoId?: string
): Promise<boolean> {
  const supabase = createClient();
  let consultaPartidos = supabase
    .from("partidos")
    .select("id, torneo_id, categoria, estado, jugador_1_id, jugador_2_id")
    .neq("estado", "Finalizado");

  if (torneoId) {
    consultaPartidos = consultaPartidos.eq("torneo_id", torneoId);
  }

  const { data: partidos, error: errorPartidos } = await consultaPartidos;
  if (errorPartidos) {
    throw new Error(
      `No se pudieron leer los partidos pendientes: ${errorPartidos.message}`
    );
  }

  const filas = partidos ?? [];
  if (filas.length === 0) return false;

  const torneoIds = [
    ...new Set(filas.map((partido) => partido.torneo_id).filter(Boolean)),
  ];
  if (torneoIds.length === 0) return false;

  const { data: inscripciones, error: errorInscripciones } = await supabase
    .from("torneo_jugadores")
    .select("torneo_id, jugador_id, categoria")
    .in("torneo_id", torneoIds);

  if (errorInscripciones) {
    throw new Error(
      `No se pudieron leer las inscripciones: ${errorInscripciones.message}`
    );
  }

  const vigentes = (inscripciones ?? []) as InscripcionVigente[];
  let huboCambios = false;

  for (const partido of filas) {
    const slots = slotsRetirados(
      {
        torneo_id: partido.torneo_id,
        categoria: partido.categoria,
        jugador_1_id: partido.jugador_1_id,
        jugador_2_id: partido.jugador_2_id,
      },
      vigentes
    );
    if (!slots.hayQueLimpiar) continue;
    const limpio = await limpiarPartidoPendiente(partido.id, slots);
    if (limpio) huboCambios = true;
  }

  return huboCambios;
}
