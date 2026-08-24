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

/** 2^floor(log2(N)): el cuadro objetivo (11 → 8). */
export function potenciaDeDosInferior(cantidad: number) {
  if (cantidad < 2) return 1;
  return 2 ** Math.floor(Math.log2(cantidad));
}

export function esPotenciaDeDos(cantidad: number) {
  return cantidad >= 2 && (cantidad & (cantidad - 1)) === 0;
}

/**
 * Partidos preliminares = N - 2^floor(log2(N)).
 * 11 inscriptos → cuadro de 8 → 3 cruces (6 juegan, 5 pasan directo).
 */
export function planClasificacionPreliminar(cantidadInscriptos: number) {
  const n = Math.max(0, cantidadInscriptos);
  const cuadro = n < 2 ? n : potenciaDeDosInferior(n);
  const partidos = n < 2 ? 0 : n - cuadro;
  const jugadoresEnCruces = partidos * 2;
  const pasesDirectos = n - jugadoresEnCruces;
  return { cuadro, partidos, jugadoresEnCruces, pasesDirectos };
}

function jugadorAAsiento(jugador: Jugador): AsientoCuadro {
  return {
    id: jugador.id,
    nombre_completo: jugador.nombre_completo,
    isBye: false,
  };
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

export function sortearCrucesDraft(inscriptos: Jugador[]): CruceDraft[] {
  if (inscriptos.length < 2) return [];
  const mezclados = mezclarFisherYates(inscriptos);
  const parejas = emparejarAsientosEnPares(mezclados.map(jugadorAAsiento));
  return parejas.map((pareja, indice) => ({
    id: `draft-${indice}`,
    jugador_1_id: slotIdDeAsiento(pareja.mejor),
    jugador_2_id: slotIdDeAsiento(pareja.peor),
  }));
}

export function idsEnCrucesDraft(cruces: CruceDraft[]): Set<string> {
  const ids = new Set<string>();
  for (const cruce of cruces) {
    for (const slotId of [cruce.jugador_1_id, cruce.jugador_2_id]) {
      if (!esSlotBye(slotId)) ids.add(slotId);
    }
  }
  return ids;
}

export function inscriptosConPaseDirecto(
  inscriptos: Jugador[],
  cruces: CruceDraft[]
): Jugador[] {
  const enCruces = idsEnCrucesDraft(cruces);
  return inscriptos.filter((jugador) => !enCruces.has(jugador.id));
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
  categoria: string,
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
      categoria,
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
    categoria,
    jugador_1_id: mejor.id,
    jugador_2_id: peor.id,
    ganador_id: null,
    resultado: null,
    fase,
    estado: "Pendiente" as const,
  };
}

/**
 * Empareja a todos los inscriptos: floor(N/2) partidos.
 * El impar restante queda sin cruce para acomodarlo a mano.
 */
export async function generarCrucesClasificacion(
  torneo_id: string,
  categoria: string,
  inscriptos: Jugador[]
): Promise<ResultadoGeneracionCruces> {
  const supabase = createClient();
  const categoriaTorneo = categoria.trim();
  if (!categoriaTorneo) {
    throw new Error("Falta la categoría del torneo para generar cruces.");
  }

  if (inscriptos.length < 2) {
    throw new Error(
      "Se necesitan al menos 2 jugadores para armar los cruces."
    );
  }

  await borrarClasificacionDeCategoria(supabase, torneo_id, categoriaTorneo);

  const puntajes = await obtenerPuntajesRanking(
    inscriptos.map((jugador) => jugador.id)
  );

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

  const parejas = emparejarAsientosPorExtremos(
    ordenados.map(jugadorAAsiento)
  );
  const nuevosPartidos = parejas.map(({ mejor, peor }) =>
    filaPartidoDesdePareja(
      torneo_id,
      categoriaTorneo,
      "Clasificacion",
      mejor,
      peor
    )
  );

  if (nuevosPartidos.length === 0) {
    throw new Error("No se pudieron armar partidos de clasificación.");
  }

  for (const partido of nuevosPartidos) {
    const { error } = await supabase
      .from("partidos")
      .insert(partido as Record<string, unknown>);
    if (error) {
      throw new Error(
        `No se pudieron insertar los cruces de clasificación: ${error.message}`
      );
    }
  }

  return {
    ok: true,
    partidosCreados: nuevosPartidos.length,
  };
}

/**
 * Persiste el borrador editable de clasificación. Solo guarda cruces
 * reales (dos jugadores). Reemplaza los preliminares de esta categoría.
 */
export async function guardarCrucesDesdeDraft(
  torneo_id: string,
  categoria: string,
  inscriptos: Jugador[],
  cruces: CruceDraft[]
): Promise<ResultadoGeneracionCruces> {
  const categoriaTorneo = categoria.trim();
  if (!categoriaTorneo) {
    throw new Error("Falta la categoría del torneo para guardar cruces.");
  }
  if (cruces.length === 0) {
    throw new Error("No hay cruces en el borrador para guardar.");
  }

  if (hayByeVsByeEnDraft(cruces)) {
    throw new Error("No se puede guardar un cruce BYE vs BYE.");
  }

  for (const cruce of cruces) {
    if (
      !cruce.jugador_1_id ||
      !cruce.jugador_2_id ||
      cruce.jugador_1_id === cruce.jugador_2_id
    ) {
      throw new Error("Cada cruce de clasificación necesita dos jugadores distintos.");
    }
  }

  const supabase = createClient();
  await borrarClasificacionDeCategoria(supabase, torneo_id, categoriaTorneo);

  const nuevosPartidos = cruces.map((cruce) =>
    filaPartidoDesdePareja(
      torneo_id,
      categoriaTorneo,
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

export interface CruceClasificacionEditado {
  id: string | null;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
}

function normalizarSlotClasificacion(
  slotId: string | null | undefined
): string | null {
  if (esSlotBye(slotId)) return null;
  const id = slotId?.trim();
  return id ? id : null;
}

function payloadClasificacionDesdeJugadores(
  jugador_1_id: string | null,
  jugador_2_id: string | null
) {
  const bye1 = jugador_1_id == null;
  const bye2 = jugador_2_id == null;

  if (bye1 && bye2) {
    throw new Error("No se puede guardar un cruce BYE vs BYE.");
  }

  if (bye1 || bye2) {
    return {
      jugador_1_id,
      jugador_2_id,
      ganador_id: bye1 ? jugador_2_id : jugador_1_id,
      resultado: "W.O.",
      estado: "Finalizado" as const,
    };
  }

  return {
    jugador_1_id,
    jugador_2_id,
    ganador_id: null,
    resultado: null,
    estado: "Pendiente" as const,
  };
}

/** Alta / baja / modificación de partidos de clasificación. Control total del admin.
 *  No aplica potencias de 2 ni impide que un jugador juegue más de un cruce. */
export async function guardarEdicionClasificacion(params: {
  torneoId: string;
  categoria: string;
  idsJugadoresCategoria: string[];
  idsPartidosActuales: string[];
  cruces: CruceClasificacionEditado[];
}): Promise<{ ok: true; partidosGuardados: number }> {
  const { torneoId, categoria, idsJugadoresCategoria, idsPartidosActuales, cruces } =
    params;
  const categoriaTorneo = categoria.trim();
  if (!categoriaTorneo) {
    throw new Error("Falta la categoría del torneo para editar clasificación.");
  }

  for (const cruce of cruces) {
    const jugador_1_id = normalizarSlotClasificacion(cruce.jugador_1_id);
    const jugador_2_id = normalizarSlotClasificacion(cruce.jugador_2_id);

    if (jugador_1_id == null && jugador_2_id == null) {
      throw new Error("Cada cruce necesita al menos un jugador o un BYE.");
    }
    if (
      jugador_1_id &&
      jugador_2_id &&
      jugador_1_id === jugador_2_id
    ) {
      throw new Error("Un jugador no puede jugar contra sí mismo.");
    }
    for (const id of [jugador_1_id, jugador_2_id]) {
      if (id && !idsJugadoresCategoria.includes(id)) {
        throw new Error(
          "Hay un jugador que no está inscripto en esta categoría."
        );
      }
    }
  }

  const supabase = createClient();
  const idsDraft = new Set(
    cruces.map((cruce) => cruce.id).filter((id): id is string => Boolean(id))
  );
  const idsABorrar = idsPartidosActuales.filter((id) => !idsDraft.has(id));

  if (idsABorrar.length > 0) {
    const { error } = await supabase.from("partidos").delete().in("id", idsABorrar);
    if (error) {
      throw new Error(`No se pudieron eliminar cruces: ${error.message}`);
    }
  }

  for (const cruce of cruces) {
    const jugador_1_id = normalizarSlotClasificacion(cruce.jugador_1_id);
    const jugador_2_id = normalizarSlotClasificacion(cruce.jugador_2_id);
    const esBye = jugador_1_id == null || jugador_2_id == null;
    const payloadBase = payloadClasificacionDesdeJugadores(
      jugador_1_id,
      jugador_2_id
    );

    if (cruce.id) {
      const { data: actual, error: errorActual } = await supabase
        .from("partidos")
        .select("jugador_1_id, jugador_2_id")
        .eq("id", cruce.id)
        .maybeSingle();
      if (errorActual) {
        throw new Error(`No se pudo leer un cruce: ${errorActual.message}`);
      }

      const mismosJugadores =
        (actual?.jugador_1_id ?? null) === jugador_1_id &&
        (actual?.jugador_2_id ?? null) === jugador_2_id;
      const payload = esBye
        ? payloadBase
        : mismosJugadores
          ? {
              jugador_1_id,
              jugador_2_id,
            }
          : payloadBase;

      const { error } = await supabase
        .from("partidos")
        .update(payload)
        .eq("id", cruce.id)
        .eq("fase", "Clasificacion");
      if (error) {
        throw new Error(`No se pudo actualizar un cruce: ${error.message}`);
      }
    } else {
      const { error } = await supabase.from("partidos").insert({
        torneo_id: torneoId,
        categoria: categoriaTorneo,
        fase: "Clasificacion",
        ...payloadBase,
      });
      if (error) {
        throw new Error(`No se pudo agregar un cruce: ${error.message}`);
      }
    }
  }

  return { ok: true, partidosGuardados: cruces.length };
}

interface PartidoClasificacion {
  id?: string;
  created_at?: string;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
  ganador_id: string | null;
  estado: string | null;
}

function esPartidoClasificacionBye(partido: PartidoClasificacion) {
  const bye1 = partido.jugador_1_id == null;
  const bye2 = partido.jugador_2_id == null;
  return bye1 !== bye2;
}

function ganadorHumanoClasificacionBye(
  partido: PartidoClasificacion
): string | null {
  if (!esPartidoClasificacionBye(partido)) return null;
  return partido.jugador_1_id ?? partido.jugador_2_id;
}

function validarPartidoClasificacionCompleto(partido: PartidoClasificacion) {
  if (partido.jugador_1_id == null && partido.jugador_2_id == null) {
    throw new Error("Hay un partido de clasificación BYE vs BYE.");
  }

  if (esPartidoClasificacionBye(partido)) {
    const humano = ganadorHumanoClasificacionBye(partido);
    if (!humano || partido.ganador_id !== humano) {
      throw new Error(
        "Hay un partido de clasificación W.O. sin ganador válido."
      );
    }
    return;
  }

  if (!partido.jugador_1_id || !partido.jugador_2_id) {
    throw new Error("Hay un partido de clasificación con un solo jugador.");
  }

  perdedorDePartidoClasificacion(partido);
}

/** Perdedor humano del cruce, o null si el rival era BYE (W.O.). */
function perdedorDePartidoClasificacion(
  partido: PartidoClasificacion
): string | null {
  const ganadorId = partido.ganador_id;
  if (!ganadorId) {
    throw new Error("Hay un partido de clasificación sin ganador definido.");
  }

  if (esPartidoClasificacionBye(partido)) {
    return null;
  }

  if (partido.jugador_1_id === ganadorId) {
    return partido.jugador_2_id;
  }
  if (partido.jugador_2_id === ganadorId) {
    return partido.jugador_1_id;
  }
  throw new Error(
    "Hay un partido de clasificación cuyo ganador no es uno de los dos jugadores."
  );
}

function asientoJugadorId(jugadorId: string): AsientoCuadro {
  return {
    id: jugadorId,
    nombre_completo: jugadorId,
    isBye: false,
  };
}

function asientoByeSlot(indice = 0): AsientoCuadro {
  return {
    id: `bye-${indice}`,
    nombre_completo: "BYE",
    isBye: true,
  };
}

function agruparPartidosEnParesConsecutivos<T>(items: T[]): [T, T | undefined][] {
  const pares: [T, T | undefined][] = [];
  for (let i = 0; i < items.length; i += 2) {
    pares.push([items[i], items[i + 1]]);
  }
  return pares;
}

/** Conserva el orden de llegada (Cruce 1, 2, 3…) cuando comparten created_at. */
function ordenarPartidosClasificacion(partidos: PartidoClasificacion[]) {
  return partidos
    .map((partido, indiceOriginal) => ({ partido, indiceOriginal }))
    .sort((a, b) => {
      const ta = a.partido.created_at ? Date.parse(a.partido.created_at) : 0;
      const tb = b.partido.created_at ? Date.parse(b.partido.created_at) : 0;
      if (ta !== tb) return ta - tb;
      return a.indiceOriginal - b.indiceOriginal;
    })
    .map(({ partido }) => partido);
}

type FilaPartidoInsert = ReturnType<typeof filaPartidoDesdePareja>;

/** Índice 1-based del cruce de clasificación (Cruce 1 … Cruce 6). */
type IndiceCruceClasificacion = 1 | 2 | 3 | 4 | 5 | 6;

type FuenteAsientoOctavo =
  | { tipo: "bye_estructural" }
  | { tipo: "ganador"; cruce: IndiceCruceClasificacion }
  | { tipo: "perdedor"; cruce: IndiceCruceClasificacion };

type EntradaTemplateOctavos6 =
  | {
      tipo: "cruce";
      slot1: Exclude<FuenteAsientoOctavo, { tipo: "bye_estructural" }>;
      slot2: Exclude<FuenteAsientoOctavo, { tipo: "bye_estructural" }>;
    }
  | { tipo: "pase_libre_estructural" };

interface ResultadoCruceClasificacion {
  ganador: string;
  perdedor: string | null;
}

/**
 * Template fijo RogmaLab: 6 cruces de clasificación → 8 octavos (16 slots).
 * Replica la planilla Excel: cruces Formato Mundial en posiciones tácticas y
 * 2 pases libres estructurales (jugador real vs BYE), nunca casilleros vacíos.
 *
 * Par C1+C2 → Oct1 (G1 vs L2), Oct3 (G2 vs L1)
 * Par C3+C4 → Oct4 (G3 vs L4), Oct5 (G4 vs L3)
 * Par C5+C6 → Oct7 (G5 vs L6), Oct8 (G6 vs L5)
 * Pases libres → Oct2 y Oct6 (mitades superior e inferior del cuadro)
 */
export const TEMPLATE_OCTAVOS_6_CLASIFICACION: readonly EntradaTemplateOctavos6[] =
  [
    {
      tipo: "cruce",
      slot1: { tipo: "ganador", cruce: 1 },
      slot2: { tipo: "perdedor", cruce: 2 },
    },
    { tipo: "pase_libre_estructural" },
    {
      tipo: "cruce",
      slot1: { tipo: "ganador", cruce: 2 },
      slot2: { tipo: "perdedor", cruce: 1 },
    },
    {
      tipo: "cruce",
      slot1: { tipo: "ganador", cruce: 3 },
      slot2: { tipo: "perdedor", cruce: 4 },
    },
    {
      tipo: "cruce",
      slot1: { tipo: "ganador", cruce: 4 },
      slot2: { tipo: "perdedor", cruce: 3 },
    },
    { tipo: "pase_libre_estructural" },
    {
      tipo: "cruce",
      slot1: { tipo: "ganador", cruce: 5 },
      slot2: { tipo: "perdedor", cruce: 6 },
    },
    {
      tipo: "cruce",
      slot1: { tipo: "ganador", cruce: 6 },
      slot2: { tipo: "perdedor", cruce: 5 },
    },
  ] as const;

const CANTIDAD_PASES_LIBRES_ESTRUCTURALES_TEMPLATE_6 = 2;

function resultadosCrucesClasificacion(
  partidosClasificacion: PartidoClasificacion[]
): ResultadoCruceClasificacion[] {
  return partidosClasificacion.map((partido) => ({
    ganador: partido.ganador_id!,
    perdedor: perdedorDePartidoClasificacion(partido),
  }));
}

/**
 * Jugadores candidatos a pase libre en octavos (sin casilleros huérfanos):
 * 1) Inscriptos sin cruce Qualy · 2) Ganadores de Qualy vs BYE ·
 * 3) Ganadores de cruces 1 y 4 (mitades del cuadro, si faltan cupos).
 */
function construirColaPasesLibreOctavo6(
  partidosClasificacion: PartidoClasificacion[],
  pasesDirectos: string[],
  cruces: ResultadoCruceClasificacion[]
): string[] {
  const vistos = new Set<string>();
  const cola: string[] = [];

  const agregar = (jugadorId: string | null | undefined) => {
    if (!jugadorId || vistos.has(jugadorId)) return;
    cola.push(jugadorId);
    vistos.add(jugadorId);
  };

  for (const jugadorId of pasesDirectos) {
    agregar(jugadorId);
  }

  for (const partido of partidosClasificacion) {
    if (esPartidoClasificacionBye(partido)) {
      agregar(ganadorHumanoClasificacionBye(partido));
    }
  }

  return cola;
}

/** Cola ampliada para rellenar cuadros genéricos (no template 6). */
function construirColaPasesLibreCuadro(
  partidosClasificacion: PartidoClasificacion[],
  pasesDirectos: string[],
  cruces: ResultadoCruceClasificacion[]
): string[] {
  const cola = construirColaPasesLibreOctavo6(
    partidosClasificacion,
    pasesDirectos,
    cruces
  );
  const vistos = new Set(cola);

  const agregar = (jugadorId: string | null | undefined) => {
    if (!jugadorId || vistos.has(jugadorId)) return;
    cola.push(jugadorId);
    vistos.add(jugadorId);
  };

  for (const cruce of cruces) {
    agregar(cruce.ganador);
    agregar(cruce.perdedor);
  }

  return cola;
}

function resolverAsientoOctavo(
  fuente: Exclude<FuenteAsientoOctavo, { tipo: "bye_estructural" }>,
  cruces: ResultadoCruceClasificacion[],
  contadorBye: { valor: number }
): AsientoCuadro {
  const cruce = cruces[fuente.cruce - 1];
  if (!cruce) {
    throw new Error(
      `El template de 6 clasificaciones espera el Cruce ${fuente.cruce}.`
    );
  }

  if (fuente.tipo === "ganador") {
    return asientoJugadorId(cruce.ganador);
  }

  if (cruce.perdedor) {
    return asientoJugadorId(cruce.perdedor);
  }

  return asientoByeSlot(contadorBye.valor++);
}

function construirOctavoPaseLibreEstructural(
  colaPasesLibre: string[],
  cursorCola: { indice: number },
  torneo_id: string,
  categoria: string,
  fase: string,
  contadorBye: { valor: number }
): FilaPartidoInsert {
  const jugadorId = colaPasesLibre[cursorCola.indice];
  if (!jugadorId) {
    throw new Error(
      "No hay jugadores disponibles para los pases libres estructurales de octavos. Revisá inscriptos y cruces de clasificación."
    );
  }
  cursorCola.indice += 1;

  return filaPartidoDesdePareja(
    torneo_id,
    categoria,
    fase,
    asientoJugadorId(jugadorId),
    asientoByeSlot(contadorBye.valor++)
  );
}

function construirOctavoDesdeTemplate(
  entrada: EntradaTemplateOctavos6,
  cruces: ResultadoCruceClasificacion[],
  colaPasesLibre: string[],
  cursorCola: { indice: number },
  torneo_id: string,
  categoria: string,
  fase: string,
  contadorBye: { valor: number }
): FilaPartidoInsert {
  if (entrada.tipo === "pase_libre_estructural") {
    return construirOctavoPaseLibreEstructural(
      colaPasesLibre,
      cursorCola,
      torneo_id,
      categoria,
      fase,
      contadorBye
    );
  }

  const asiento1 = resolverAsientoOctavo(
    entrada.slot1,
    cruces,
    contadorBye
  );
  const asiento2 = resolverAsientoOctavo(
    entrada.slot2,
    cruces,
    contadorBye
  );

  return filaPartidoDesdePareja(
    torneo_id,
    categoria,
    fase,
    asiento1,
    asiento2
  );
}

function validarPartidoOctavoConOrigen(partido: FilaPartidoInsert) {
  const humano1 = partido.jugador_1_id;
  const humano2 = partido.jugador_2_id;

  if (!humano1 && !humano2) {
    throw new Error(
      "Hay un octavo de final sin jugadores reales (casillero huérfano)."
    );
  }

  if ((humano1 && !humano2) || (!humano1 && humano2)) {
    if (partido.estado !== "Finalizado" || !partido.ganador_id) {
      throw new Error(
        "Un pase libre de octavos debe resolverse como W.O. con ganador definido."
      );
    }
  }
}

/** Posicionamiento fijo: exactamente 6 cruces Qualy → 8 octavos. */
function construirPrimeraRondaTemplate6Clasificacion(
  partidosClasificacion: PartidoClasificacion[],
  pasesDirectos: string[],
  torneo_id: string,
  categoria: string,
  fase: string
): FilaPartidoInsert[] {
  if (partidosClasificacion.length !== 6) {
    throw new Error(
      "El template de 6 clasificaciones requiere exactamente 6 partidos."
    );
  }

  const cruces = resultadosCrucesClasificacion(partidosClasificacion);
  const colaPasesLibre = construirColaPasesLibreOctavo6(
    partidosClasificacion,
    pasesDirectos,
    cruces
  );

  if (colaPasesLibre.length < CANTIDAD_PASES_LIBRES_ESTRUCTURALES_TEMPLATE_6) {
    throw new Error(
      `Se necesitan ${CANTIDAD_PASES_LIBRES_ESTRUCTURALES_TEMPLATE_6} jugadores con pase directo (fuera de la Qualy) o ganadores de cruces Qualy vs BYE para completar los octavos; hay ${colaPasesLibre.length} disponibles.`
    );
  }

  const contadorBye = { valor: 0 };
  const cursorCola = { indice: 0 };

  const octavos = TEMPLATE_OCTAVOS_6_CLASIFICACION.map((entrada) =>
    construirOctavoDesdeTemplate(
      entrada,
      cruces,
      colaPasesLibre,
      cursorCola,
      torneo_id,
      categoria,
      fase,
      contadorBye
    )
  );

  for (const partido of octavos) {
    validarPartidoOctavoConOrigen(partido);
  }

  return octavos;
}

/**
 * Formato Mundial: agrupa partidos de clasificación en pares adyacentes
 * (P1+P2, P3+P4, …) y cruza ganadores/perdedores dentro de cada par:
 * A = Ganador(P_i) vs Perdedor(P_{i+1}), B = Ganador(P_{i+1}) vs Perdedor(P_i).
 *
 * Con exactamente 6 cruces Qualy aplica TEMPLATE_OCTAVOS_6_CLASIFICACION.
 */
export function construirPrimeraRondaFormatoMundial(
  partidosClasificacion: PartidoClasificacion[],
  torneo_id: string,
  categoria: string,
  fase: string,
  pasesDirectos: string[] = []
): FilaPartidoInsert[] {
  const categoriaTorneo = categoria.trim();
  const ordenados = ordenarPartidosClasificacion(partidosClasificacion);

  if (ordenados.length === 6) {
    return construirPrimeraRondaTemplate6Clasificacion(
      ordenados,
      pasesDirectos,
      torneo_id,
      categoriaTorneo,
      fase
    );
  }

  const paresConsecutivos = agruparPartidosEnParesConsecutivos(ordenados);
  const primeraRonda: FilaPartidoInsert[] = [];
  let byeIndice = 0;

  for (const [p1, p2] of paresConsecutivos) {
    if (p2) {
      const w1 = p1.ganador_id!;
      const l1 = perdedorDePartidoClasificacion(p1);
      const w2 = p2.ganador_id!;
      const l2 = perdedorDePartidoClasificacion(p2);

      primeraRonda.push(
        filaPartidoDesdePareja(
          torneo_id,
          categoriaTorneo,
          fase,
          asientoJugadorId(w1),
          l2 ? asientoJugadorId(l2) : asientoByeSlot(byeIndice++)
        )
      );
      primeraRonda.push(
        filaPartidoDesdePareja(
          torneo_id,
          categoriaTorneo,
          fase,
          asientoJugadorId(w2),
          l1 ? asientoJugadorId(l1) : asientoByeSlot(byeIndice++)
        )
      );
      continue;
    }

    const ganador = p1.ganador_id!;
    const perdedor = perdedorDePartidoClasificacion(p1);
    primeraRonda.push(
      filaPartidoDesdePareja(
        torneo_id,
        categoriaTorneo,
        fase,
        asientoJugadorId(ganador),
        asientoByeSlot(byeIndice++)
      )
    );
    if (perdedor) {
      primeraRonda.push(
        filaPartidoDesdePareja(
          torneo_id,
          categoriaTorneo,
          fase,
          asientoJugadorId(perdedor),
          asientoByeSlot(byeIndice++)
        )
      );
    }
  }

  return primeraRonda;
}

/**
 * Completa el cuadro a potencia de 2 con jugador real vs BYE (nunca casilleros vacíos).
 */
function completarPrimeraRondaCuadro(
  partidos: FilaPartidoInsert[],
  torneo_id: string,
  categoria: string,
  faseTemporal: string,
  colaPasesLibre: string[],
  contadorBye: { valor: number }
): FilaPartidoInsert[] {
  const resultado = [...partidos];
  const objetivo = potenciaDeDosSuperior(Math.max(1, resultado.length));

  if (objetivo > 8) {
    throw new Error(
      `Hay ${resultado.length} partido(s) en la primera ronda; el cuadro admite hasta 8 (Octavos). Reducí cruces o inscriptos.`
    );
  }

  let indiceCola = 0;
  while (resultado.length < objetivo) {
    const jugadorId = colaPasesLibre[indiceCola];
    if (!jugadorId) {
      throw new Error(
        "No hay jugadores disponibles para completar los pases libres del cuadro eliminatorio."
      );
    }
    indiceCola += 1;

    const partido = filaPartidoDesdePareja(
      torneo_id,
      categoria,
      faseTemporal,
      asientoJugadorId(jugadorId),
      asientoByeSlot(contadorBye.valor++)
    );
    validarPartidoOctavoConOrigen(partido);
    resultado.push(partido);
  }

  return resultado;
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
  if (cantidadPrimeraRonda < 1) {
    throw new Error(
      "No hay partidos para armar la primera ronda del cuadro eliminatorio."
    );
  }

  if (!esPotenciaDeDos(cantidadPrimeraRonda)) {
    throw new Error(
      `La primera ronda del cuadro debe tener una cantidad potencia de 2 (1, 2, 4 u 8). Hay ${cantidadPrimeraRonda}.`
    );
  }

  const rondas = RONDAS_POR_CANTIDAD[cantidadPrimeraRonda];
  if (!rondas) {
    throw new Error(
      `El cuadro admite hasta 8 partidos en Octavos de Final. Hay ${cantidadPrimeraRonda}.`
    );
  }
  return rondas;
}

async function borrarClasificacionDeCategoria(
  supabase: ReturnType<typeof createClient>,
  torneo_id: string,
  categoria: string
) {
  const { error: errorBorrar } = await supabase
    .from("partidos")
    .delete()
    .eq("torneo_id", torneo_id)
    .eq("fase", "Clasificacion")
    .eq("categoria", categoria);

  if (errorBorrar) {
    throw new Error(
      `No se pudieron reemplazar los cruces anteriores: ${errorBorrar.message}`
    );
  }
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

async function borrarCuadroEliminatorioDeCategoria(
  supabase: ReturnType<typeof createClient>,
  torneo_id: string,
  categoria: string
) {
  const { data, error } = await supabase
    .from("partidos")
    .select("id, fase, siguiente_partido_id")
    .eq("torneo_id", torneo_id)
    .eq("categoria", categoria)
    .in("fase", [...FASES_CUADRO_ELIMINATORIO]);

  if (error) {
    throw new Error(
      `No se pudo leer el cuadro eliminatorio: ${error.message}`
    );
  }

  const ids = (data ?? []).map((partido) => partido.id as string);
  if (ids.length === 0) return;

  const idsSet = new Set(ids);
  const idsOrdenados = [...ids].sort((a, b) => {
    const partidoA = (data ?? []).find((fila) => fila.id === a);
    const partidoB = (data ?? []).find((fila) => fila.id === b);
    const aApuntaFuera = idsSet.has(partidoA?.siguiente_partido_id as string)
      ? 1
      : 0;
    const bApuntaFuera = idsSet.has(partidoB?.siguiente_partido_id as string)
      ? 1
      : 0;
    return bApuntaFuera - aApuntaFuera;
  });

  for (const id of idsOrdenados) {
    const { error: errorBorrar } = await supabase
      .from("partidos")
      .delete()
      .eq("id", id);
    if (errorBorrar) {
      throw new Error(
        `No se pudo borrar el cuadro eliminatorio: ${errorBorrar.message}`
      );
    }
  }
}

/**
 * Arma el cuadro eliminatorio (Formato Mundial) a partir de la clasificación:
 * ganadores y perdedores se cruzan entre pares consecutivos de partidos Qualy.
 * Con exactamente 6 cruces Qualy aplica TEMPLATE_OCTAVOS_6_CLASIFICACION.
 */
export async function generarCuadroFinal(
  torneo_id: string,
  categoria: string,
  jugadorIdsCategoria: string[],
  opciones?: { reemplazarExistente?: boolean }
): Promise<ResultadoGeneracionCruces> {
  const supabase = createClient();
  const idsCreados: string[] = [];
  const categoriaTorneo = categoria.trim();
  const idsCategoria = new Set(jugadorIdsCategoria);

  if (!categoriaTorneo) {
    throw new Error("Falta la categoría del torneo para armar el cuadro.");
  }

  if (idsCategoria.size === 0) {
    throw new Error(
      "Seleccioná una categoría con inscriptos para armar el cuadro final."
    );
  }

  const { data, error } = await supabase
    .from("partidos")
    .select(
      "id, created_at, jugador_1_id, jugador_2_id, ganador_id, estado, categoria"
    )
    .eq("torneo_id", torneo_id)
    .eq("fase", "Clasificacion")
    .eq("categoria", categoriaTorneo)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `No se pudieron cargar los partidos de clasificación: ${error.message}`
    );
  }

  const partidosClasificacion = ordenarPartidosClasificacion(
    (data as PartidoClasificacion[] | null) ?? []
  );

  if (partidosClasificacion.length === 0) {
    throw new Error(
      "No hay partidos de clasificación para esta categoría. Generá y completá la fase de clasificación primero."
    );
  }

  const pendientes = partidosClasificacion.filter(
    (partido) => partido.estado !== "Finalizado" || !partido.ganador_id
  );
  if (pendientes.length > 0) {
    throw new Error(
      `Faltan ${pendientes.length} resultado(s) de clasificación por cargar antes de armar el cuadro.`
    );
  }

  const idsEnCruces = new Set<string>();
  for (const partido of partidosClasificacion) {
    if (partido.jugador_1_id) idsEnCruces.add(partido.jugador_1_id);
    if (partido.jugador_2_id) idsEnCruces.add(partido.jugador_2_id);
    validarPartidoClasificacionCompleto(partido);
  }

  const pasesDirectos = jugadorIdsCategoria.filter(
    (id) => !idsEnCruces.has(id)
  );

  const { data: cuadroExistente, error: errorCuadro } = await supabase
    .from("partidos")
    .select("id")
    .eq("torneo_id", torneo_id)
    .eq("categoria", categoriaTorneo)
    .in("fase", [...FASES_CUADRO_ELIMINATORIO])
    .limit(1);

  if (errorCuadro) {
    throw new Error(
      `No se pudo verificar el cuadro existente: ${errorCuadro.message}`
    );
  }

  const yaHayCuadroDeCategoria = (cuadroExistente ?? []).length > 0;
  if (yaHayCuadroDeCategoria) {
    if (opciones?.reemplazarExistente) {
      await borrarCuadroEliminatorioDeCategoria(
        supabase,
        torneo_id,
        categoriaTorneo
      );
    } else {
      throw new Error(
        "Ya existe un cuadro eliminatorio para esta categoría. Eliminalo primero si querés regenerarlo."
      );
    }
  }

  let byeIndice = 0;
  let primeraRonda = construirPrimeraRondaFormatoMundial(
    partidosClasificacion,
    torneo_id,
    categoriaTorneo,
    "Clasificacion",
    pasesDirectos
  );

  const usaTemplateSeisClasificacion = partidosClasificacion.length === 6;

  if (!usaTemplateSeisClasificacion) {
    const crucesGenericos = resultadosCrucesClasificacion(
      partidosClasificacion
    );
    const colaPasesLibre = construirColaPasesLibreCuadro(
      partidosClasificacion,
      pasesDirectos,
      crucesGenericos
    );
    let indiceCola = 0;

    while (
      !esPotenciaDeDos(primeraRonda.length) &&
      indiceCola < colaPasesLibre.length
    ) {
      const jugadorId = colaPasesLibre[indiceCola];
      indiceCola += 1;
      const partido = filaPartidoDesdePareja(
        torneo_id,
        categoriaTorneo,
        "Clasificacion",
        asientoJugadorId(jugadorId),
        asientoByeSlot(byeIndice++)
      );
      validarPartidoOctavoConOrigen(partido);
      primeraRonda.push(partido);
    }

    primeraRonda = completarPrimeraRondaCuadro(
      primeraRonda,
      torneo_id,
      categoriaTorneo,
      "Clasificacion",
      colaPasesLibre.slice(indiceCola),
      { valor: byeIndice }
    );
  } else if (primeraRonda.length !== 8) {
    throw new Error(
      "El template de 6 clasificaciones debe producir 8 octavos. Revisá los cruces Qualy."
    );
  }

  const rondas = rondasEliminatorias(primeraRonda.length);
  const faseCalculada = rondas[0];
  for (const partido of primeraRonda) {
    partido.fase = faseCalculada;
    partido.categoria = categoriaTorneo;
  }

  try {
    const idsRondaSiguiente = await crearRondasPosteriores(
      supabase,
      torneo_id,
      categoriaTorneo,
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
        `No se pudieron crear los partidos de ${faseCalculada}: ${errorPrimera?.message ?? "cantidad inválida"}`
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
      primeraFase: faseCalculada,
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
 * Reemplaza los asientos de una ronda eliminatoria.
 * Permite Lucky Loser: el mismo jugador puede estar en más de un partido.
 * Si ambos asientos son reales, el cruce queda Pendiente (se puede programar
 * y cargar resultado), aunque antes hubiera un BYE / W.O.
 */
export async function guardarEdicionPrimeraRonda(params: {
  cruces: CrucePrimeraRondaEditado[];
  idsRondasPosteriores: string[];
}): Promise<{ ok: true }> {
  const { cruces, idsRondasPosteriores } = params;
  if (cruces.length === 0) {
    throw new Error("No hay cruces de esta ronda para guardar.");
  }

  for (const cruce of cruces) {
    if (cruce.jugador_1_id && cruce.jugador_1_id === cruce.jugador_2_id) {
      throw new Error("Un jugador no puede jugar contra sí mismo.");
    }
    if (!cruce.jugador_1_id && !cruce.jugador_2_id) {
      throw new Error("No se puede guardar un cruce BYE vs BYE.");
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
  categoria: string,
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
          categoria,
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
  torneo_id: string;
  fase: string;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
  ganador_id: string | null;
  resultado: string | null;
  estado: string | null;
  siguiente_partido_id: string | null;
};

async function sincronizarClasificadoPorVictoriasClasificacion(
  supabase: ReturnType<typeof createClient>,
  torneo_id: string,
  jugador_id: string
) {
  const { count, error: errorConteo } = await supabase
    .from("partidos")
    .select("*", { count: "exact", head: true })
    .eq("torneo_id", torneo_id)
    .eq("fase", "Clasificacion")
    .eq("estado", "Finalizado")
    .eq("ganador_id", jugador_id);

  if (errorConteo) {
    throw new Error(
      `No se pudo verificar victorias de clasificación: ${errorConteo.message}`
    );
  }

  const clasificado = (count ?? 0) > 0;
  const { error } = await supabase
    .from("torneo_jugadores")
    .update({ clasificado })
    .eq("torneo_id", torneo_id)
    .eq("jugador_id", jugador_id);

  if (error) {
    throw new Error(
      `No se pudo actualizar el estado clasificado: ${error.message}`
    );
  }
}

async function marcarClasificadosEnTorneo(
  supabase: ReturnType<typeof createClient>,
  torneo_id: string,
  jugador_ids: string[],
  clasificado: boolean
) {
  if (jugador_ids.length === 0) return;

  const { error } = await supabase
    .from("torneo_jugadores")
    .update({ clasificado })
    .eq("torneo_id", torneo_id)
    .in("jugador_id", jugador_ids);

  if (error) {
    throw new Error(
      `No se pudo marcar inscripciones clasificadas: ${error.message}`
    );
  }
}

type SnapshotDestino = {
  id: string;
  estado: string | null;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
};

const DURACION_PARTIDO_MS = 90 * 60 * 1000;

async function verificarColisionCancha(
  supabase: ReturnType<typeof createClient>,
  params: {
    partido_id: string;
    cancha: string;
    fecha_programada: string;
  }
): Promise<void> {
  const centro = new Date(params.fecha_programada);
  if (Number.isNaN(centro.getTime())) return;

  const desde = new Date(centro.getTime() - DURACION_PARTIDO_MS).toISOString();
  const hasta = new Date(centro.getTime() + DURACION_PARTIDO_MS).toISOString();

  const { data, error } = await supabase
    .from("partidos")
    .select("id")
    .eq("cancha", params.cancha)
    .neq("id", params.partido_id)
    .not("fecha_programada", "is", null)
    .gte("fecha_programada", desde)
    .lte("fecha_programada", hasta)
    .limit(1);

  if (error) {
    throw new Error(
      `No se pudo verificar disponibilidad de la cancha: ${error.message}`
    );
  }

  if (data && data.length > 0) {
    throw new Error(
      `Error: La ${params.cancha} ya está ocupada en ese horario por otro partido.`
    );
  }
}

/**
 * Actualiza solo fecha/hora y cancha. No toca resultado, ganador ni estado.
 */
export async function guardarProgramacionPartido(params: {
  partido_id: string;
  cancha: string | null;
  fecha_programada: string | null;
}): Promise<{ ok: true }> {
  const supabase = createClient();

  if (params.cancha && params.fecha_programada) {
    await verificarColisionCancha(supabase, {
      partido_id: params.partido_id,
      cancha: params.cancha,
      fecha_programada: params.fecha_programada,
    });
  }

  const { error } = await supabase
    .from("partidos")
    .update({
      cancha: params.cancha,
      fecha_programada: params.fecha_programada,
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
    .select(
      "torneo_id, fase, jugador_1_id, jugador_2_id, ganador_id, resultado, estado, siguiente_partido_id"
    )
    .eq("id", partido_id)
    .maybeSingle();

  if (errorActual || !actual) {
    throw new Error(
      `No se pudo leer el partido: ${errorActual?.message ?? "no encontrado"}`
    );
  }

  const snapshot = actual as SnapshotPartido;
  const viejoGanadorId = snapshot.ganador_id;
  const esClasificacion = snapshot.fase === "Clasificacion";

  if (
    snapshot.jugador_1_id !== nuevoGanadorId &&
    snapshot.jugador_2_id !== nuevoGanadorId
  ) {
    throw new Error("El ganador debe ser uno de los dos jugadores del partido.");
  }

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

    if (esClasificacion) {
      await sincronizarClasificadoPorVictoriasClasificacion(
        supabase,
        snapshot.torneo_id,
        nuevoGanadorId
      );
    }

    return { ok: true };
  }

  // 3) El ganador cambió (o es la primera carga). Si hay destino de cuadro,
  //    validamos y preparamos la corrección ANTES de tocar el partido actual.
  let destino: SnapshotDestino | null = null;
  let columnaDestino: "jugador_1_id" | "jugador_2_id" | null = null;

  if (!esClasificacion && snapshot.siguiente_partido_id) {
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

  if (esClasificacion) {
    await sincronizarClasificadoPorVictoriasClasificacion(
      supabase,
      snapshot.torneo_id,
      nuevoGanadorId
    );
    if (viejoGanadorId && viejoGanadorId !== nuevoGanadorId) {
      await sincronizarClasificadoPorVictoriasClasificacion(
        supabase,
        snapshot.torneo_id,
        viejoGanadorId
      );
    }
  }

  return { ok: true };
}
