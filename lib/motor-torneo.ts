import { createClient } from "@/lib/supabase/client";
import type { Jugador } from "@/lib/types";

// Misma escala de puntos que usa /ranking (ver app/ranking/page.tsx).
const PUNTOS_POR_PARTICIPACION = 1;
const PUNTOS_POR_PARTIDO_GANADO = 3;
const PUNTOS_BONUS_FINALISTA = 5;
const PUNTOS_BONUS_CAMPEON = 10;
const FASE_FINAL = "Final";

export type ResultadoGeneracionCruces = {
  ok: true;
  partidosCreados: number;
};

interface PuntajeRanking {
  puntos: number;
  partidosGanados: number;
}

// Calcula puntos y victorias para los jugadores indicados, con las mismas
// reglas del ranking general (participación + victorias + bonus de Final).
async function obtenerPuntajesRanking(
  jugadorIds: string[]
): Promise<Map<string, PuntajeRanking>> {
  const supabase = createClient();
  const ids = new Set(jugadorIds);

  const [inscripcionesResult, partidosFinalizadosResult] = await Promise.all([
    supabase.from("torneo_jugadores").select("jugador_id"),
    supabase
      .from("partidos")
      .select("ganador_id, fase, jugador_1_id, jugador_2_id")
      .eq("estado", "Finalizado"),
  ]);

  if (inscripcionesResult.error) {
    throw new Error(
      `No se pudo cargar el ranking para armar los cruces: ${inscripcionesResult.error.message}`
    );
  }
  if (partidosFinalizadosResult.error) {
    throw new Error(
      `No se pudo cargar el ranking para armar los cruces: ${partidosFinalizadosResult.error.message}`
    );
  }

  const participaciones = new Map<string, number>();
  for (const fila of inscripcionesResult.data ?? []) {
    const id = fila.jugador_id as string | null;
    if (!id || !ids.has(id)) continue;
    participaciones.set(id, (participaciones.get(id) ?? 0) + 1);
  }

  const victorias = new Map<string, number>();
  const bonus = new Map<string, number>();

  for (const partido of partidosFinalizadosResult.data ?? []) {
    const ganadorId = partido.ganador_id as string | null;
    if (ganadorId && ids.has(ganadorId)) {
      victorias.set(ganadorId, (victorias.get(ganadorId) ?? 0) + 1);
    }

    if (partido.fase !== FASE_FINAL || !ganadorId) continue;

    if (ids.has(ganadorId)) {
      bonus.set(ganadorId, (bonus.get(ganadorId) ?? 0) + PUNTOS_BONUS_CAMPEON);
    }

    const j1 = partido.jugador_1_id as string | null;
    const j2 = partido.jugador_2_id as string | null;
    const perdedorId =
      j1 === ganadorId ? j2 : j2 === ganadorId ? j1 : null;

    if (perdedorId && ids.has(perdedorId)) {
      bonus.set(
        perdedorId,
        (bonus.get(perdedorId) ?? 0) + PUNTOS_BONUS_FINALISTA
      );
    }
  }

  const puntajes = new Map<string, PuntajeRanking>();
  for (const id of jugadorIds) {
    const participacion = participaciones.get(id) ?? 0;
    const partidosGanados = victorias.get(id) ?? 0;
    const puntosBonus = bonus.get(id) ?? 0;
    puntajes.set(id, {
      partidosGanados,
      puntos:
        participacion * PUNTOS_POR_PARTICIPACION +
        partidosGanados * PUNTOS_POR_PARTIDO_GANADO +
        puntosBonus,
    });
  }

  return puntajes;
}

// Empareja 0 vs N-1, 1 vs N-2, ... sobre un array ya ordenado de mejor a peor.
function emparejarPorExtremos(ordenados: Jugador[]) {
  const parejas: { mejor: Jugador; peor: Jugador }[] = [];
  let izquierda = 0;
  let derecha = ordenados.length - 1;

  while (izquierda < derecha) {
    parejas.push({
      mejor: ordenados[izquierda],
      peor: ordenados[derecha],
    });
    izquierda += 1;
    derecha -= 1;
  }

  return parejas;
}

/**
 * Genera los cruces de clasificación de un torneo:
 * 1. Exige cantidad par de inscriptos.
 * 2. Ordena por ranking (mejor → peor).
 * 3. Empareja extremos (mejor disponible vs peor disponible).
 * 4. Inserta los partidos en Supabase con fase "Clasificacion".
 */
export async function generarCrucesClasificacion(
  torneo_id: string,
  inscriptos: Jugador[]
): Promise<ResultadoGeneracionCruces> {
  const supabase = createClient();

  // Candado anti-duplicados: no regenerar si ya hay cruces de Clasificacion.
  const { count, error: errorConteo } = await supabase
    .from("partidos")
    .select("*", { count: "exact", head: true })
    .eq("torneo_id", torneo_id)
    .eq("fase", "Clasificacion");

  if (errorConteo) {
    throw new Error(
      `No se pudo verificar cruces existentes: ${errorConteo.message}`
    );
  }

  if ((count ?? 0) > 0) {
    throw new Error(
      "Ya existen cruces generados para este torneo. Eliminalos primero si querés regenerarlos."
    );
  }

  if (inscriptos.length % 2 !== 0) {
    throw new Error(
      "La cantidad de inscriptos debe ser par para armar los cruces."
    );
  }

  const puntajes = await obtenerPuntajesRanking(
    inscriptos.map((jugador) => jugador.id)
  );

  // Mejor (más puntos) primero; empate → más victorias; empate → A-Z.
  const ordenados = [...inscriptos].sort((a, b) => {
    const rankingA = puntajes.get(a.id) ?? { puntos: 0, partidosGanados: 0 };
    const rankingB = puntajes.get(b.id) ?? { puntos: 0, partidosGanados: 0 };

    if (rankingB.puntos !== rankingA.puntos) {
      return rankingB.puntos - rankingA.puntos;
    }
    if (rankingB.partidosGanados !== rankingA.partidosGanados) {
      return rankingB.partidosGanados - rankingA.partidosGanados;
    }
    return a.nombre_completo.localeCompare(b.nombre_completo, "es");
  });

  const parejas = emparejarPorExtremos(ordenados);

  const nuevosPartidos = parejas.map(({ mejor, peor }) => ({
    torneo_id,
    jugador_1_id: mejor.id,
    jugador_2_id: peor.id,
    fase: "Clasificacion",
    estado: "Pendiente" as const,
  }));

  const { error } = await supabase.from("partidos").insert(nuevosPartidos);

  if (error) {
    throw new Error(
      `No se pudieron insertar los cruces de clasificación: ${error.message}`
    );
  }

  return {
    ok: true,
    partidosCreados: nuevosPartidos.length,
  };
}

interface PartidoClasificacion {
  jugador_1_id: string | null;
  jugador_2_id: string | null;
  ganador_id: string | null;
  estado: string | null;
}

const FASES_CUADRO_ELIMINATORIO = [
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinal",
  "Final",
] as const;

// Cuadro de 16 jugadores = 8 partidos de clasificación → 15 de eliminación.
const PARTIDOS_CLASIFICACION_ESPERADOS = 8;

// Fisher-Yates: mezclá el array in-place y devolvélo (mismo reference).
function mezclarFisherYates<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temporal = items[i];
    items[i] = items[j];
    items[j] = temporal;
  }
  return items;
}

// Si algo falla a mitad de camino, borramos en orden inverso (los que
// apuntan con siguiente_partido_id primero) para no chocar con la FK.
async function rollbackPartidosCreados(
  supabase: ReturnType<typeof createClient>,
  idsCreados: string[]
) {
  for (const id of [...idsCreados].reverse()) {
    const { error } = await supabase.from("partidos").delete().eq("id", id);
    if (error) {
      console.error(
        `Rollback incompleto al borrar partido ${id}:`,
        error.message
      );
    }
  }
}

/**
 * Arma el cuadro de eliminación directa de 16 jugadores (15 partidos):
 * Final → 2 Semis → 4 Cuartos → 8 Octavos, encadenados con
 * siguiente_partido_id. Los Octavos llevan jugadores (ganador vs perdedor
 * sorteado); el resto nace con jugadores null.
 */
export async function generarCuadroFinal(
  torneo_id: string
): Promise<ResultadoGeneracionCruces> {
  const supabase = createClient();
  const idsCreados: string[] = [];

  const { data, error } = await supabase
    .from("partidos")
    .select("jugador_1_id, jugador_2_id, ganador_id, estado")
    .eq("torneo_id", torneo_id)
    .eq("fase", "Clasificacion");

  if (error) {
    throw new Error(
      `No se pudieron cargar los partidos de clasificación: ${error.message}`
    );
  }

  const partidosClasificacion = (data as PartidoClasificacion[] | null) ?? [];

  if (partidosClasificacion.length !== PARTIDOS_CLASIFICACION_ESPERADOS) {
    throw new Error(
      "El cuadro final requiere exactamente 8 partidos de Clasificación (16 jugadores)."
    );
  }

  const todosFinalizados = partidosClasificacion.every(
    (partido) =>
      partido.estado === "Finalizado" && Boolean(partido.ganador_id)
  );

  if (!todosFinalizados) {
    throw new Error(
      "Faltan resultados por cargar en la etapa de Clasificación."
    );
  }

  // Candado: no regenerar si ya hay algún partido del cuadro eliminatorio.
  const { count: cantidadCuadro, error: errorConteoCuadro } = await supabase
    .from("partidos")
    .select("*", { count: "exact", head: true })
    .eq("torneo_id", torneo_id)
    .in("fase", [...FASES_CUADRO_ELIMINATORIO]);

  if (errorConteoCuadro) {
    throw new Error(
      `No se pudo verificar el cuadro existente: ${errorConteoCuadro.message}`
    );
  }

  if ((cantidadCuadro ?? 0) > 0) {
    throw new Error(
      "Ya existe un cuadro final para este torneo. Eliminalo primero si querés regenerarlo."
    );
  }

  const ganadores: string[] = [];
  const perdedores: string[] = [];

  for (const partido of partidosClasificacion) {
    const ganadorId = partido.ganador_id!;
    const perdedorId =
      partido.jugador_1_id === ganadorId
        ? partido.jugador_2_id
        : partido.jugador_2_id === ganadorId
          ? partido.jugador_1_id
          : null;

    if (!perdedorId) {
      throw new Error(
        "Faltan resultados por cargar en la etapa de Clasificación."
      );
    }

    ganadores.push(ganadorId);
    perdedores.push(perdedorId);
  }

  const perdedoresAleatorios = mezclarFisherYates([...perdedores]);

  try {
    // 1) Final (sin jugadores; nadie apunta a ella todavía).
    const { data: finalData, error: errorFinal } = await supabase
      .from("partidos")
      .insert({
        torneo_id,
        jugador_1_id: null,
        jugador_2_id: null,
        fase: "Final",
        estado: "Pendiente",
        siguiente_partido_id: null,
      })
      .select("id")
      .single();

    if (errorFinal || !finalData) {
      throw new Error(
        `No se pudo crear la Final: ${errorFinal?.message ?? "sin id"}`
      );
    }
    const finalId = finalData.id as string;
    idsCreados.push(finalId);

    // 2) 2 Semifinales → Final.
    const { data: semisData, error: errorSemis } = await supabase
      .from("partidos")
      .insert([
        {
          torneo_id,
          jugador_1_id: null,
          jugador_2_id: null,
          fase: "Semifinal",
          estado: "Pendiente",
          siguiente_partido_id: finalId,
        },
        {
          torneo_id,
          jugador_1_id: null,
          jugador_2_id: null,
          fase: "Semifinal",
          estado: "Pendiente",
          siguiente_partido_id: finalId,
        },
      ])
      .select("id");

    if (errorSemis || !semisData || semisData.length !== 2) {
      throw new Error(
        `No se pudieron crear las Semifinales: ${errorSemis?.message ?? "cantidad inválida"}`
      );
    }
    const semifinalIds = semisData.map((fila) => fila.id as string);
    idsCreados.push(...semifinalIds);

    // 3) 4 Cuartos → Semis (0,1 → Semi 0; 2,3 → Semi 1).
    const { data: cuartosData, error: errorCuartos } = await supabase
      .from("partidos")
      .insert([
        {
          torneo_id,
          jugador_1_id: null,
          jugador_2_id: null,
          fase: "Cuartos de Final",
          estado: "Pendiente",
          siguiente_partido_id: semifinalIds[0],
        },
        {
          torneo_id,
          jugador_1_id: null,
          jugador_2_id: null,
          fase: "Cuartos de Final",
          estado: "Pendiente",
          siguiente_partido_id: semifinalIds[0],
        },
        {
          torneo_id,
          jugador_1_id: null,
          jugador_2_id: null,
          fase: "Cuartos de Final",
          estado: "Pendiente",
          siguiente_partido_id: semifinalIds[1],
        },
        {
          torneo_id,
          jugador_1_id: null,
          jugador_2_id: null,
          fase: "Cuartos de Final",
          estado: "Pendiente",
          siguiente_partido_id: semifinalIds[1],
        },
      ])
      .select("id");

    if (errorCuartos || !cuartosData || cuartosData.length !== 4) {
      throw new Error(
        `No se pudieron crear los Cuartos: ${errorCuartos?.message ?? "cantidad inválida"}`
      );
    }
    const cuartosIds = cuartosData.map((fila) => fila.id as string);
    idsCreados.push(...cuartosIds);

    // 4) 8 Octavos con jugadores (ganador vs perdedor sorteado) → Cuartos.
    const octavos = ganadores.map((ganadorId, indice) => ({
      torneo_id,
      jugador_1_id: ganadorId,
      jugador_2_id: perdedoresAleatorios[indice],
      fase: "Octavos de Final",
      estado: "Pendiente" as const,
      siguiente_partido_id: cuartosIds[Math.floor(indice / 2)],
    }));

    const { data: octavosData, error: errorOctavos } = await supabase
      .from("partidos")
      .insert(octavos)
      .select("id");

    if (errorOctavos || !octavosData || octavosData.length !== 8) {
      throw new Error(
        `No se pudieron crear los Octavos: ${errorOctavos?.message ?? "cantidad inválida"}`
      );
    }
    idsCreados.push(...octavosData.map((fila) => fila.id as string));

    return {
      ok: true,
      partidosCreados: idsCreados.length,
    };
  } catch (error) {
    await rollbackPartidosCreados(supabase, idsCreados);
    throw error;
  }
}

/**
 * Tras finalizar un partido del cuadro, sienta al ganador en la próxima
 * "silla vacía" del partido apuntado por siguiente_partido_id:
 * primero jugador_1_id, si ya está ocupado entonces jugador_2_id.
 * Si siguiente_partido_id es null (ej. la Final), no hace nada.
 */
export async function promoverGanadorAlSiguientePartido(partido: {
  siguiente_partido_id: string | null;
  ganador_id: string;
}): Promise<void> {
  if (!partido.siguiente_partido_id) return;

  const supabase = createClient();

  const { data: siguiente, error } = await supabase
    .from("partidos")
    .select("id, jugador_1_id, jugador_2_id")
    .eq("id", partido.siguiente_partido_id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo leer el partido siguiente: ${error.message}`
    );
  }

  if (!siguiente) {
    throw new Error("No se encontró el partido siguiente del cuadro.");
  }

  if (siguiente.jugador_1_id === null) {
    const { error: errorUpdate } = await supabase
      .from("partidos")
      .update({ jugador_1_id: partido.ganador_id })
      .eq("id", siguiente.id);

    if (errorUpdate) {
      throw new Error(
        `No se pudo asignar el ganador como jugador 1: ${errorUpdate.message}`
      );
    }
    return;
  }

  if (siguiente.jugador_2_id === null) {
    const { error: errorUpdate } = await supabase
      .from("partidos")
      .update({ jugador_2_id: partido.ganador_id })
      .eq("id", siguiente.id);

    if (errorUpdate) {
      throw new Error(
        `No se pudo asignar el ganador como jugador 2: ${errorUpdate.message}`
      );
    }
    return;
  }

  throw new Error(
    "El partido siguiente ya tiene ambos jugadores asignados."
  );
}

type SnapshotPartido = {
  ganador_id: string | null;
  resultado: string | null;
  estado: string | null;
  siguiente_partido_id: string | null;
};

type SnapshotDestino = {
  id: string;
  estado: string | null;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
};

/**
 * Guarda resultado/ganador de un partido y, si el ganador cambió, propaga
 * el reemplazo al partido destino (efecto dominó) solo si ese destino
 * sigue en Pendiente. Si el destino ya se jugó, aborta con error estricto
 * y no deja la base desincronizada (rollback del update local si hace falta).
 */
export async function actualizarResultadoPartidoConPropagacion(params: {
  partido_id: string;
  resultado: string;
  ganador_id: string;
}): Promise<{ ok: true }> {
  const supabase = createClient();
  const { partido_id, resultado, ganador_id: nuevoGanadorId } = params;

  // 1) Lectura previa del partido actual.
  const { data: actual, error: errorActual } = await supabase
    .from("partidos")
    .select("ganador_id, resultado, estado, siguiente_partido_id")
    .eq("id", partido_id)
    .maybeSingle();

  if (errorActual || !actual) {
    throw new Error(
      `No se pudo leer el partido: ${errorActual?.message ?? "no encontrado"}`
    );
  }

  const snapshot = actual as SnapshotPartido;
  const viejoGanadorId = snapshot.ganador_id;

  // 2) Mismo ganador: solo actualizamos texto/estado y listo.
  if (viejoGanadorId !== null && viejoGanadorId === nuevoGanadorId) {
    const { error } = await supabase
      .from("partidos")
      .update({
        resultado,
        ganador_id: nuevoGanadorId,
        estado: "Finalizado",
      })
      .eq("id", partido_id);

    if (error) {
      throw new Error(`No se pudo actualizar el resultado: ${error.message}`);
    }

    return { ok: true };
  }

  // 3) El ganador cambió (o es la primera carga). Si hay destino, validamos
  //    y preparamos la corrección ANTES de tocar el partido actual.
  let destino: SnapshotDestino | null = null;
  let columnaDestino: "jugador_1_id" | "jugador_2_id" | null = null;

  if (snapshot.siguiente_partido_id) {
    const { data: siguiente, error: errorSiguiente } = await supabase
      .from("partidos")
      .select("id, estado, jugador_1_id, jugador_2_id")
      .eq("id", snapshot.siguiente_partido_id)
      .maybeSingle();

    if (errorSiguiente || !siguiente) {
      throw new Error(
        `No se pudo leer el partido siguiente: ${errorSiguiente?.message ?? "no encontrado"}`
      );
    }

    destino = siguiente as SnapshotDestino;

    // Candado: solo se puede cambiar el ganador si el siguiente sigue Pendiente.
    if (viejoGanadorId !== null && destino.estado !== "Pendiente") {
      throw new Error(
        "No podés cambiar el ganador porque el partido siguiente ya se está jugando o finalizó. Anulá el partido siguiente primero."
      );
    }

    if (viejoGanadorId !== null) {
      // Corrección: reemplazar al viejo ganador donde esté sentado.
      if (destino.jugador_1_id === viejoGanadorId) {
        columnaDestino = "jugador_1_id";
      } else if (destino.jugador_2_id === viejoGanadorId) {
        columnaDestino = "jugador_2_id";
      } else {
        throw new Error(
          "El ganador anterior no figura en el partido siguiente. Revisá el cuadro manualmente."
        );
      }
    } else if (destino.estado === "Pendiente") {
      // Primera carga: ocupar la primera silla vacía.
      if (destino.jugador_1_id === null) {
        columnaDestino = "jugador_1_id";
      } else if (destino.jugador_2_id === null) {
        columnaDestino = "jugador_2_id";
      } else {
        throw new Error(
          "El partido siguiente ya tiene ambos jugadores asignados."
        );
      }
    }
  }

  // 4) Update del partido actual.
  const { error: errorUpdateActual } = await supabase
    .from("partidos")
    .update({
      resultado,
      ganador_id: nuevoGanadorId,
      estado: "Finalizado",
    })
    .eq("id", partido_id);

  if (errorUpdateActual) {
    throw new Error(
      `No se pudo actualizar el resultado: ${errorUpdateActual.message}`
    );
  }

  // 5) Propagación al destino (si corresponde). Si falla, rollback del actual.
  if (destino && columnaDestino) {
    const { error: errorDestino } = await supabase
      .from("partidos")
      .update({ [columnaDestino]: nuevoGanadorId })
      .eq("id", destino.id);

    if (errorDestino) {
      const { error: errorRollback } = await supabase
        .from("partidos")
        .update({
          resultado: snapshot.resultado,
          ganador_id: snapshot.ganador_id,
          estado: snapshot.estado,
        })
        .eq("id", partido_id);

      if (errorRollback) {
        console.error(
          "Rollback incompleto tras fallar la propagación del ganador:",
          errorRollback.message
        );
      }

      throw new Error(
        `No se pudo actualizar el partido siguiente: ${errorDestino.message}`
      );
    }
  }

  return { ok: true };
}
