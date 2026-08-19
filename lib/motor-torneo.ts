import { createClient } from "@/lib/supabase/client";
import type { Jugador } from "@/lib/types";
import {
  calcularBonusFinales,
  contarVictoriasRanking,
  puntajeDesdeConteos,
  type PartidoParaRanking,
  type PuntajeRanking,
} from "@/lib/motor-ranking";

export type ResultadoGeneracionCruces = {
  ok: true;
  partidosCreados: number;
  primeraFase?: string;
};

async function obtenerPuntajesRanking(
  jugadorIds: string[]
): Promise<Map<string, PuntajeRanking>> {
  const supabase = createClient();
  const ids = new Set(jugadorIds);

  const [inscripcionesResult, partidosFinalizadosResult] = await Promise.all([
    supabase.from("torneo_jugadores").select("jugador_id"),
    supabase
      .from("partidos")
      .select("ganador_id, fase, jugador_1_id, jugador_2_id, resultado")
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

  const partidos = (partidosFinalizadosResult.data ??
    []) as PartidoParaRanking[];
  const victorias = contarVictoriasRanking(partidos);
  const bonus = calcularBonusFinales(partidos);

  const puntajes = new Map<string, PuntajeRanking>();
  for (const id of jugadorIds) {
    puntajes.set(
      id,
      puntajeDesdeConteos({
        participaciones: participaciones.get(id) ?? 0,
        partidosGanados: victorias.get(id) ?? 0,
        bonus: bonus.get(id) ?? 0,
      })
    );
  }

  return puntajes;
}

export interface AsientoCuadro {
  id: string | null;
  nombre_completo: string;
  isBye: boolean;
}

/** Valor del <select> para un asiento Bye en el borrador de cruces. */
export const SLOT_BYE = "BYE";

export function esSlotBye(slotId: string | null | undefined) {
  if (slotId == null || slotId === "" || slotId === SLOT_BYE) return true;
  return slotId.startsWith("bye-");
}

export function esBye(asiento: AsientoCuadro) {
  return asiento.isBye || esSlotBye(asiento.id);
}

export function potenciaDeDosSuperior(cantidad: number) {
  if (cantidad <= 1) return 2;
  return 2 ** Math.ceil(Math.log2(cantidad));
}

/**
 * Completa el bracket a la potencia de 2 siguiente inyectando nodos Bye.
 */
export function completarConByes(ordenados: Jugador[]): AsientoCuadro[] {
  const potenciaObjetivo = potenciaDeDosSuperior(ordenados.length);
  const cantidadByes = potenciaObjetivo - ordenados.length;

  const asientos: AsientoCuadro[] = ordenados.map((jugador) => ({
    id: jugador.id,
    nombre_completo: jugador.nombre_completo,
    isBye: false,
  }));

  for (let i = 0; i < cantidadByes; i += 1) {
    asientos.push({
      id: `bye-${i}`,
      nombre_completo: "BYE",
      isBye: true,
    });
  }

  return asientos;
}

export function emparejarAsientosPorExtremos(ordenados: AsientoCuadro[]) {
  const parejas: { mejor: AsientoCuadro; peor: AsientoCuadro }[] = [];
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

export function emparejarAsientosEnPares(asientos: AsientoCuadro[]) {
  const parejas: { mejor: AsientoCuadro; peor: AsientoCuadro }[] = [];
  for (let i = 0; i < asientos.length; i += 2) {
    const a = asientos[i];
    const b = asientos[i + 1];
    if (!a || !b) continue;
    parejas.push({ mejor: a, peor: b });
  }
  return parejas;
}

/** Fisher-Yates: copia mezclada (no muta el original). */
export function mezclarFisherYates<T>(items: T[]): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temporal = copia[i];
    copia[i] = copia[j];
    copia[j] = temporal;
  }
  return copia;
}

export interface CruceDraft {
  id: string;
  jugador_1_id: string;
  jugador_2_id: string;
}

function slotIdDeAsiento(asiento: AsientoCuadro) {
  return esBye(asiento) ? SLOT_BYE : (asiento.id as string);
}

/** Si el azar dejó un BYE vs BYE, intercambia un Bye con un jugador real. */
function repararParejasByeVsBye(
  parejas: { mejor: AsientoCuadro; peor: AsientoCuadro }[]
) {
  const copia = parejas.map((pareja) => ({ ...pareja }));

  for (let i = 0; i < copia.length; i += 1) {
    if (!(esBye(copia[i].mejor) && esBye(copia[i].peor))) continue;

    const j = copia.findIndex(
      (otra, idx) => idx !== i && !esBye(otra.mejor) && !esBye(otra.peor)
    );
    if (j === -1) {
      throw new Error("No se pudo armar el sorteo sin un cruce BYE vs BYE.");
    }

    const temporal = copia[i].peor;
    copia[i].peor = copia[j].peor;
    copia[j].peor = temporal;
  }

  return copia;
}

export function sortearCrucesDraft(inscriptos: Jugador[]): CruceDraft[] {
  if (inscriptos.length < 2) return [];
  const asientos = mezclarFisherYates(completarConByes(inscriptos));
  const parejas = repararParejasByeVsBye(emparejarAsientosEnPares(asientos));
  return parejas.map((pareja, indice) => ({
    id: `draft-${indice}`,
    jugador_1_id: slotIdDeAsiento(pareja.mejor),
    jugador_2_id: slotIdDeAsiento(pareja.peor),
  }));
}

export function idsDuplicadosEnDraft(cruces: CruceDraft[]): Set<string> {
  const conteo = new Map<string, number>();
  for (const cruce of cruces) {
    for (const slotId of [cruce.jugador_1_id, cruce.jugador_2_id]) {
      if (esSlotBye(slotId)) continue;
      conteo.set(slotId, (conteo.get(slotId) ?? 0) + 1);
    }
  }
  return new Set(
    [...conteo.entries()]
      .filter(([, cantidad]) => cantidad > 1)
      .map(([id]) => id)
  );
}

export function hayByeVsByeEnDraft(cruces: CruceDraft[]) {
  return cruces.some(
    (cruce) => esSlotBye(cruce.jugador_1_id) && esSlotBye(cruce.jugador_2_id)
  );
}

export function asientoDesdeSlot(
  slotId: string,
  inscriptos: Jugador[]
): AsientoCuadro {
  if (esSlotBye(slotId)) {
    return { id: null, nombre_completo: "BYE", isBye: true };
  }
  const jugador = inscriptos.find((item) => item.id === slotId);
  if (!jugador) {
    throw new Error("Hay un slot con un jugador que no está inscripto.");
  }
  return {
    id: jugador.id,
    nombre_completo: jugador.nombre_completo,
    isBye: false,
  };
}

function filaPartidoDesdePareja(
  torneo_id: string,
  fase: string,
  mejor: AsientoCuadro,
  peor: AsientoCuadro
) {
  const byeMejor = esBye(mejor);
  const byePeor = esBye(peor);

  if (byeMejor && byePeor) {
    throw new Error("No se puede generar un cruce Bye vs Bye.");
  }

  if (byeMejor || byePeor) {
    const real = byePeor ? mejor : peor;
    return {
      torneo_id,
      jugador_1_id: byeMejor ? null : mejor.id,
      jugador_2_id: byePeor ? null : peor.id,
      ganador_id: real.id,
      resultado: "W.O.",
      fase,
      estado: "Finalizado" as const,
    };
  }

  return {
    torneo_id,
    jugador_1_id: mejor.id,
    jugador_2_id: peor.id,
    ganador_id: null,
    resultado: null,
    fase,
    estado: "Pendiente" as const,
  };
}

/**
 * Genera los cruces de clasificación de un torneo:
 * 1. Completa a potencia de 2 con Byes si hay cantidad impar (o no potencia).
 * 2. Ordena por ranking (mejor → peor).
 * 3. Empareja extremos (mejor disponible vs peor disponible / Bye).
 * 4. Si hay Bye, el partido nace Finalizado con W.O. para el jugador real.
 * 5. Inserta los partidos en Supabase con fase "Clasificacion".
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

  if (inscriptos.length < 2) {
    throw new Error(
      "Se necesitan al menos 2 jugadores para armar los cruces."
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

  const asientos = completarConByes(ordenados);
  const parejas = emparejarAsientosPorExtremos(asientos);

  const nuevosPartidos = parejas.map(({ mejor, peor }) =>
    filaPartidoDesdePareja(torneo_id, "Clasificacion", mejor, peor)
  );

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

/**
 * Persiste el borrador editable de clasificación (el sorteo azaroso o
 * los intercambios manuales del admin) con las mismas reglas de Bye / W.O.
 */
export async function guardarCrucesDesdeDraft(
  torneo_id: string,
  inscriptos: Jugador[],
  cruces: CruceDraft[]
): Promise<ResultadoGeneracionCruces> {
  if (cruces.length === 0) {
    throw new Error("No hay cruces en el borrador para guardar.");
  }

  const duplicados = idsDuplicadosEnDraft(cruces);
  if (duplicados.size > 0) {
    throw new Error(
      "Hay jugadores asignados a más de un cruce. Corregí los duplicados antes de guardar."
    );
  }

  if (hayByeVsByeEnDraft(cruces)) {
    throw new Error("No se puede guardar un cruce BYE vs BYE.");
  }

  const supabase = createClient();

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

  const nuevosPartidos = cruces.map((cruce) =>
    filaPartidoDesdePareja(
      torneo_id,
      "Clasificacion",
      asientoDesdeSlot(cruce.jugador_1_id, inscriptos),
      asientoDesdeSlot(cruce.jugador_2_id, inscriptos)
    )
  );

  const { error } = await supabase.from("partidos").insert(nuevosPartidos);

  if (error) {
    throw new Error(
      `No se pudieron guardar los cruces de clasificación: ${error.message}`
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

/** Cantidad de partidos de la 1ª ronda → árbol hasta la Final. */
const RONDAS_POR_CANTIDAD: Record<number, readonly string[]> = {
  8: ["Octavos de Final", "Cuartos de Final", "Semifinal", "Final"],
  4: ["Cuartos de Final", "Semifinal", "Final"],
  2: ["Semifinal", "Final"],
  1: ["Final"],
};

function rondasEliminatorias(cantidadPrimeraRonda: number) {
  const rondas = RONDAS_POR_CANTIDAD[cantidadPrimeraRonda];
  if (!rondas) {
    throw new Error(
      `La clasificación debe tener 1, 2, 4 u 8 partidos (potencia de 2). Hay ${cantidadPrimeraRonda}.`
    );
  }
  return rondas;
}

function partidoPerteneceACategoria(
  partido: { jugador_1_id: string | null; jugador_2_id: string | null },
  idsCategoria: Set<string>
) {
  return Boolean(
    (partido.jugador_1_id && idsCategoria.has(partido.jugador_1_id)) ||
      (partido.jugador_2_id && idsCategoria.has(partido.jugador_2_id))
  );
}

/** Mezcla solo perdedores; reintenta si el azar deja un ganador vs sí mismo. */
function mezclarPerdedoresSinAutocruces(
  ganadores: string[],
  perdedores: (string | null)[]
) {
  let mezclados = mezclarFisherYates([...perdedores]);
  for (let intento = 0; intento < 25; intento += 1) {
    const hayAutocruz = ganadores.some(
      (ganadorId, indice) =>
        mezclados[indice] != null && mezclados[indice] === ganadorId
    );
    if (!hayAutocruz) return mezclados;
    mezclados = mezclarFisherYates([...perdedores]);
  }
  throw new Error(
    "No se pudo sortear el cuadro sin que un jugador quede contra sí mismo."
  );
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
 * Arma el cuadro eliminatorio a partir de la clasificación de UNA categoría:
 * ganadores vs perdedores (incluye BYE) sorteados al azar.
 * La 1ª ronda es Octavos / Cuartos / Semi / Final según la cantidad
 * de partidos de clasificación (potencia de 2). El resto del árbol
 * nace vacío y se encadena con siguiente_partido_id.
 * Ganador vs BYE nace Finalizado con W.O. y el ganador avanza solo.
 */
export async function generarCuadroFinal(
  torneo_id: string,
  jugadorIdsCategoria: string[]
): Promise<ResultadoGeneracionCruces> {
  const supabase = createClient();
  const idsCreados: string[] = [];
  const idsCategoria = new Set(jugadorIdsCategoria);

  if (idsCategoria.size === 0) {
    throw new Error(
      "Seleccioná una categoría con inscriptos para armar el cuadro final."
    );
  }

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

  const partidosClasificacion = (
    (data as PartidoClasificacion[] | null) ?? []
  ).filter((partido) => partidoPerteneceACategoria(partido, idsCategoria));

  if (partidosClasificacion.length === 0) {
    throw new Error(
      "No hay partidos de clasificación para esta categoría."
    );
  }

  const pendientes = partidosClasificacion.filter(
    (partido) => partido.estado !== "Finalizado" || !partido.ganador_id
  );
  if (pendientes.length > 0) {
    throw new Error(
      `Faltan ${pendientes.length} resultado(s) de clasificación por cargar antes de armar el cuadro final.`
    );
  }

  const rondas = rondasEliminatorias(partidosClasificacion.length);
  const primeraFase = rondas[0];

  const { data: cuadroExistente, error: errorCuadro } = await supabase
    .from("partidos")
    .select("jugador_1_id, jugador_2_id, fase")
    .eq("torneo_id", torneo_id)
    .in("fase", [...FASES_CUADRO_ELIMINATORIO]);

  if (errorCuadro) {
    throw new Error(
      `No se pudo verificar el cuadro existente: ${errorCuadro.message}`
    );
  }

  const yaHayCuadroDeCategoria = (cuadroExistente ?? []).some((partido) =>
    partidoPerteneceACategoria(partido, idsCategoria)
  );
  if (yaHayCuadroDeCategoria) {
    throw new Error(
      "Ya existe un cuadro final para esta categoría. Eliminalo primero si querés regenerarlo."
    );
  }

  const ganadores: string[] = [];
  const perdedores: (string | null)[] = [];

  for (const partido of partidosClasificacion) {
    const ganadorId = partido.ganador_id!;
    if (
      partido.jugador_1_id !== ganadorId &&
      partido.jugador_2_id !== ganadorId
    ) {
      throw new Error(
        "Hay un partido de clasificación cuyo ganador no es uno de los dos jugadores."
      );
    }

    const perdedorId =
      partido.jugador_1_id === ganadorId
        ? partido.jugador_2_id
        : partido.jugador_1_id;

    ganadores.push(ganadorId);
    perdedores.push(perdedorId);
  }

  const idsGanadores = new Set(ganadores);
  if (idsGanadores.size !== ganadores.length) {
    throw new Error(
      "Hay ganadores duplicados en la clasificación. No se puede armar el cuadro."
    );
  }

  const perdedoresReales = perdedores.filter((id): id is string => id != null);
  const idsPerdedores = new Set(perdedoresReales);
  if (idsPerdedores.size !== perdedoresReales.length) {
    throw new Error(
      "Hay perdedores duplicados en la clasificación. No se puede armar el cuadro."
    );
  }
  for (const id of perdedoresReales) {
    if (idsGanadores.has(id)) {
      throw new Error(
        "Un jugador figura como ganador y perdedor a la vez. Revisá los resultados de clasificación."
      );
    }
  }

  const perdedoresAleatorios = mezclarPerdedoresSinAutocruces(
    ganadores,
    perdedores
  );

  const vistosEnRonda = new Set<string>();
  const primeraRonda = ganadores.map((ganadorId, indice) => {
    const perdedorId = perdedoresAleatorios[indice] ?? null;
    if (perdedorId != null && perdedorId === ganadorId) {
      throw new Error("Un jugador no puede jugar contra sí mismo.");
    }
    for (const id of [ganadorId, perdedorId]) {
      if (id == null) continue;
      if (vistosEnRonda.has(id)) {
        throw new Error(
          "Un jugador aparece dos veces en la misma ronda del cuadro."
        );
      }
      vistosEnRonda.add(id);
    }

    const esBye = perdedorId == null;
    return {
      torneo_id,
      jugador_1_id: ganadorId,
      jugador_2_id: perdedorId,
      ganador_id: esBye ? ganadorId : null,
      resultado: esBye ? "W.O." : null,
      fase: primeraFase,
      estado: (esBye ? "Finalizado" : "Pendiente") as
        | "Finalizado"
        | "Pendiente",
      siguiente_partido_id: null as string | null,
    };
  });

  try {
    const idsRondaSiguiente = await crearRondasPosteriores(
      supabase,
      torneo_id,
      rondas,
      idsCreados
    );

    const partidosPrimeraRonda = primeraRonda.map((partido, indice) => ({
      ...partido,
      siguiente_partido_id:
        idsRondaSiguiente.length === 0
          ? null
          : idsRondaSiguiente[Math.floor(indice / 2)],
    }));

    const { data: primeraData, error: errorPrimera } = await supabase
      .from("partidos")
      .insert(partidosPrimeraRonda)
      .select("id, ganador_id, siguiente_partido_id, estado");

    if (
      errorPrimera ||
      !primeraData ||
      primeraData.length !== partidosPrimeraRonda.length
    ) {
      throw new Error(
        `No se pudieron crear los partidos de ${primeraFase}: ${errorPrimera?.message ?? "cantidad inválida"}`
      );
    }
    idsCreados.push(...primeraData.map((fila) => fila.id as string));

    for (const fila of primeraData) {
      if (fila.estado !== "Finalizado" || !fila.ganador_id) continue;
      await promoverGanadorAlSiguientePartido({
        siguiente_partido_id: fila.siguiente_partido_id as string | null,
        ganador_id: fila.ganador_id as string,
      });
    }

    return {
      ok: true,
      partidosCreados: idsCreados.length,
      primeraFase,
    };
  } catch (error) {
    await rollbackPartidosCreados(supabase, idsCreados);
    throw error;
  }
}

export interface CrucePrimeraRondaEditado {
  id: string;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
  siguiente_partido_id: string | null;
}

/**
 * Reemplaza los asientos de la primera ronda eliminatoria (p. ej. Cuartos).
 * Recalcula W.O. vs BYE, limpia las rondas siguientes y vuelve a promover.
 */
export async function guardarEdicionPrimeraRonda(params: {
  cruces: CrucePrimeraRondaEditado[];
  idsRondasPosteriores: string[];
}): Promise<{ ok: true }> {
  const { cruces, idsRondasPosteriores } = params;
  if (cruces.length === 0) {
    throw new Error("No hay cruces de esta ronda para guardar.");
  }

  const vistos = new Set<string>();
  for (const cruce of cruces) {
    if (cruce.jugador_1_id && cruce.jugador_1_id === cruce.jugador_2_id) {
      throw new Error("Un jugador no puede jugar contra sí mismo.");
    }
    if (!cruce.jugador_1_id && !cruce.jugador_2_id) {
      throw new Error("No se puede guardar un cruce BYE vs BYE.");
    }
    for (const id of [cruce.jugador_1_id, cruce.jugador_2_id]) {
      if (!id) continue;
      if (vistos.has(id)) {
        throw new Error(
          "Un jugador aparece dos veces en la misma ronda del cuadro."
        );
      }
      vistos.add(id);
    }
  }

  const supabase = createClient();

  for (const cruce of cruces) {
    const bye1 = cruce.jugador_1_id == null;
    const bye2 = cruce.jugador_2_id == null;
    const esBye = bye1 || bye2;
    const ganadorId = bye1
      ? cruce.jugador_2_id
      : bye2
        ? cruce.jugador_1_id
        : null;

    const { error } = await supabase
      .from("partidos")
      .update({
        jugador_1_id: cruce.jugador_1_id,
        jugador_2_id: cruce.jugador_2_id,
        ganador_id: esBye ? ganadorId : null,
        resultado: esBye ? "W.O." : null,
        estado: esBye ? "Finalizado" : "Pendiente",
      })
      .eq("id", cruce.id);

    if (error) {
      throw new Error(
        `No se pudo actualizar el cruce: ${error.message}`
      );
    }
  }

  for (const id of idsRondasPosteriores) {
    const { error } = await supabase
      .from("partidos")
      .update({
        jugador_1_id: null,
        jugador_2_id: null,
        ganador_id: null,
        resultado: null,
        estado: "Pendiente",
      })
      .eq("id", id);

    if (error) {
      throw new Error(
        `No se pudieron limpiar las rondas siguientes: ${error.message}`
      );
    }
  }

  for (const cruce of cruces) {
    const bye1 = cruce.jugador_1_id == null;
    const bye2 = cruce.jugador_2_id == null;
    if (!bye1 && !bye2) continue;
    const ganadorId = bye1 ? cruce.jugador_2_id : cruce.jugador_1_id;
    if (!ganadorId) continue;
    await promoverGanadorAlSiguientePartido({
      siguiente_partido_id: cruce.siguiente_partido_id,
      ganador_id: ganadorId,
    });
  }

  return { ok: true };
}

async function crearRondasPosteriores(
  supabase: ReturnType<typeof createClient>,
  torneo_id: string,
  rondas: readonly string[],
  idsCreados: string[]
): Promise<string[]> {
  const posteriores = rondas.slice(1);
  if (posteriores.length === 0) return [];

  const desdeElFondo = [...posteriores].reverse();
  let idsRondaActual: string[] = [];

  for (let i = 0; i < desdeElFondo.length; i += 1) {
    const fase = desdeElFondo[i];
    const cantidad = 2 ** i;
    const filasIds: string[] = [];
    for (let indice = 0; indice < cantidad; indice += 1) {
      const { data, error } = await supabase
        .from("partidos")
        .insert({
          torneo_id,
          jugador_1_id: null,
          jugador_2_id: null,
          fase,
          estado: "Pendiente",
          siguiente_partido_id:
            i === 0 ? null : idsRondaActual[Math.floor(indice / 2)],
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(
          `No se pudieron crear los partidos de ${fase}: ${error?.message ?? "sin id"}`
        );
      }
      filasIds.push(data.id as string);
    }

    idsRondaActual = filasIds;
    idsCreados.push(...idsRondaActual);
  }

  return idsRondaActual;
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
 * Actualiza solo fecha/hora y cancha. No toca resultado, ganador ni estado.
 */
export async function guardarProgramacionPartido(params: {
  partido_id: string;
  cancha: string | null;
  fecha_horario: string | null;
}): Promise<{ ok: true }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("partidos")
    .update({
      cancha: params.cancha,
      fecha_horario: params.fecha_horario,
    })
    .eq("id", params.partido_id);

  if (error) {
    throw new Error(`No se pudo guardar la programación: ${error.message}`);
  }

  return { ok: true };
}

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
