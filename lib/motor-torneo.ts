import { createClient } from "@/lib/supabase/client";
import {
  DURACION_PARTIDO_MS,
  franjaPartido,
  intervalosSeSolapan,
  mensajeCanchaOcupada,
} from "@/lib/solapamiento-horarios";
import type { Jugador } from "@/lib/types";
import {
  calcularPuntajesRanking,
  compararPuntajesRanking,
  type InscripcionParaRanking,
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
  if (jugadorIds.length === 0) {
    return new Map();
  }

  const supabase = createClient();

  const [inscripcionesResult, partidosFinalizadosResult, jugadoresResult] =
    await Promise.all([
      supabase
        .from("torneo_jugadores")
        .select("jugador_id, torneo_id, categoria"),
      supabase
        .from("partidos")
        .select(
          "torneo_id, ganador_id, fase, categoria, jugador_1_id, jugador_2_id, resultado"
        )
        .eq("estado", "Finalizado"),
      supabase.from("jugadores").select("id, categoria").in("id", jugadorIds),
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
  if (jugadoresResult.error) {
    throw new Error(
      `No se pudo cargar el ranking para armar los cruces: ${jugadoresResult.error.message}`
    );
  }

  const categoriasFicha = new Map(
    ((jugadoresResult.data as { id: string; categoria: string }[] | null) ??
      []
    ).map((fila) => [fila.id, fila.categoria])
  );

  const puntajesCompletos = calcularPuntajesRanking(
    (inscripcionesResult.data as InscripcionParaRanking[] | null) ?? [],
    (partidosFinalizadosResult.data as PartidoParaRanking[] | null) ?? [],
    categoriasFicha
  );

  const puntajes = new Map<string, PuntajeRanking>();
  for (const id of jugadorIds) {
    const puntaje = puntajesCompletos.get(id);
    puntajes.set(id, {
      puntos: puntaje?.puntos ?? 0,
      partidosGanados: puntaje?.partidosGanados ?? 0,
      diferenciaGames: puntaje?.diferenciaGames ?? 0,
    });
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
    throw new Error("Hay un asiento con alguien que no está inscripto.");
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

const TIPO_FASE_CLASIFICACION = "clasificacion" as const;
const TIPO_FASE_ELIMINATORIA = "eliminatoria" as const;

function metadatosClasificacion(numero_slot: number) {
  return {
    tipo_fase: TIPO_FASE_CLASIFICACION,
    ronda: null as string | null,
    numero_slot,
  };
}

function metadatosEliminatoria(ronda: string, numero_slot: number) {
  return {
    tipo_fase: TIPO_FASE_ELIMINATORIA,
    ronda,
    numero_slot,
    fase: ronda,
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
      "Se necesitan al menos 2 personas inscriptas para armar los cruces."
    );
  }

  await borrarClasificacionDeCategoria(supabase, torneo_id, categoriaTorneo);

  const puntajes = await obtenerPuntajesRanking(
    inscriptos.map((jugador) => jugador.id)
  );

  const ordenados = [...inscriptos].sort((a, b) =>
    compararPuntajesRanking(
      {
        ...(puntajes.get(a.id) ?? {
          puntos: 0,
          partidosGanados: 0,
          diferenciaGames: 0,
        }),
        nombre_completo: a.nombre_completo,
      },
      {
        ...(puntajes.get(b.id) ?? {
          puntos: 0,
          partidosGanados: 0,
          diferenciaGames: 0,
        }),
        nombre_completo: b.nombre_completo,
      }
    )
  );

  const parejas = emparejarAsientosPorExtremos(
    ordenados.map(jugadorAAsiento)
  );
  const nuevosPartidos = parejas.map(({ mejor, peor }, indice) => ({
    ...filaPartidoDesdePareja(
      torneo_id,
      categoriaTorneo,
      "Clasificacion",
      mejor,
      peor
    ),
    ...metadatosClasificacion(indice + 1),
  }));

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
      throw new Error("Cada cruce de clasificación necesita dos nombres distintos.");
    }
  }

  const supabase = createClient();
  await borrarClasificacionDeCategoria(supabase, torneo_id, categoriaTorneo);

  const nuevosPartidos = cruces.map((cruce, indice) => ({
    ...filaPartidoDesdePareja(
      torneo_id,
      categoriaTorneo,
      "Clasificacion",
      asientoDesdeSlot(cruce.jugador_1_id, inscriptos),
      asientoDesdeSlot(cruce.jugador_2_id, inscriptos)
    ),
    ...metadatosClasificacion(indice + 1),
  }));

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
      throw new Error("Cada cruce necesita al menos un nombre o un BYE.");
    }
    if (
      jugador_1_id &&
      jugador_2_id &&
      jugador_1_id === jugador_2_id
    ) {
      throw new Error("La misma persona no puede jugar en ambos lados.");
    }
    for (const id of [jugador_1_id, jugador_2_id]) {
      if (id && !idsJugadoresCategoria.includes(id)) {
        throw new Error(
          "Hay alguien que no está inscripto en esta categoría."
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

  for (const [indice, cruce] of cruces.entries()) {
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
        .update({
          ...payload,
          tipo_fase: TIPO_FASE_CLASIFICACION,
          ronda: null,
        })
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
        ...metadatosClasificacion(indice + 1),
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
  numero_slot?: number | null;
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
        "Hay un partido de clasificación W.O. sin definir quién avanza."
      );
    }
    return;
  }

  if (!partido.jugador_1_id || !partido.jugador_2_id) {
    throw new Error("Hay un partido de clasificación con un solo lado definido.");
  }

  perdedorDePartidoClasificacion(partido);
}

/** Perdedor humano del cruce, o null si el rival era BYE (W.O.). */
function perdedorDePartidoClasificacion(
  partido: PartidoClasificacion
): string | null {
  const ganadorId = partido.ganador_id;
  if (!ganadorId) {
    throw new Error("Hay un partido de clasificación sin definir quién ganó.");
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

/** Conserva el orden de llegada (Cruce 1, 2, 3…) cuando comparten created_at. */
function ordenarPartidosClasificacion(partidos: PartidoClasificacion[]) {
  return partidos
    .map((partido, indiceOriginal) => ({ partido, indiceOriginal }))
    .sort((a, b) => {
      const sa = a.partido.numero_slot ?? Number.MAX_SAFE_INTEGER;
      const sb = b.partido.numero_slot ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      const ta = a.partido.created_at ? Date.parse(a.partido.created_at) : 0;
      const tb = b.partido.created_at ? Date.parse(b.partido.created_at) : 0;
      if (ta !== tb) return ta - tb;
      return a.indiceOriginal - b.indiceOriginal;
    })
    .map(({ partido }) => partido);
}

const FASES_CUADRO_ELIMINATORIO = [
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinal",
  "Final",
] as const;

const MAX_SLOTS_PRIMERA_RONDA = 16;

const RONDAS_POR_PARTIDOS: Record<number, readonly string[]> = {
  8: ["Octavos de Final", "Cuartos de Final", "Semifinal", "Final"],
  4: ["Cuartos de Final", "Semifinal", "Final"],
  2: ["Semifinal", "Final"],
  1: ["Final"],
};

/**
 * Jugadores que avanzan al cuadro: todos los humanos de la Qualy
 * (ganador y perdedor de cada cruce) más inscriptos con pase directo.
 */
function jugadoresQueAvanzanDeClasificacion(
  partidosClasificacion: PartidoClasificacion[],
  pasesDirectos: string[]
): string[] {
  const vistos = new Set<string>();
  const cola: string[] = [];

  const agregar = (jugadorId: string | null | undefined) => {
    if (!jugadorId || vistos.has(jugadorId)) return;
    cola.push(jugadorId);
    vistos.add(jugadorId);
  };

  for (const partido of ordenarPartidosClasificacion(partidosClasificacion)) {
    agregar(partido.ganador_id);
    agregar(perdedorDePartidoClasificacion(partido));
  }
  for (const jugadorId of pasesDirectos) {
    agregar(jugadorId);
  }

  return cola;
}

function rondasDelCuadro(cantidadPrimeraRonda: number) {
  const rondas = RONDAS_POR_PARTIDOS[cantidadPrimeraRonda];
  if (!rondas) {
    throw new Error(
      `La primera ronda debe tener 1, 2, 4 u 8 partidos. Hay ${cantidadPrimeraRonda}.`
    );
  }
  return rondas;
}

/**
 * Hard reset: borra TODOS los partidos del cuadro eliminatorio de la
 * categoría. No toca Clasificacion ni inscriptos.
 */
export async function purgarCuadroEliminatorioDeCategoria(
  torneo_id: string,
  categoria: string
): Promise<void> {
  const supabase = createClient();
  const categoriaTorneo = categoria.trim();
  if (!categoriaTorneo) {
    throw new Error("Falta la categoría para purgar el cuadro.");
  }

  const filtro = {
    torneo_id,
    categoria: categoriaTorneo,
  };

  const { error: errorUnlink } = await supabase
    .from("partidos")
    .update({ siguiente_partido_id: null })
    .eq("torneo_id", filtro.torneo_id)
    .eq("categoria", filtro.categoria)
    .eq("tipo_fase", TIPO_FASE_ELIMINATORIA);

  if (errorUnlink) {
    throw new Error(
      `No se pudieron desvincular las llaves del cuadro: ${errorUnlink.message}`
    );
  }

  const { error: errorUnlinkLegacy } = await supabase
    .from("partidos")
    .update({ siguiente_partido_id: null })
    .eq("torneo_id", filtro.torneo_id)
    .eq("categoria", filtro.categoria)
    .is("tipo_fase", null)
    .in("fase", [...FASES_CUADRO_ELIMINATORIO]);

  if (errorUnlinkLegacy) {
    throw new Error(
      `No se pudieron desvincular llaves heredadas del cuadro: ${errorUnlinkLegacy.message}`
    );
  }

  const { error: errorBorrar } = await supabase
    .from("partidos")
    .delete()
    .eq("torneo_id", filtro.torneo_id)
    .eq("categoria", filtro.categoria)
    .eq("tipo_fase", TIPO_FASE_ELIMINATORIA);

  if (errorBorrar) {
    throw new Error(
      `No se pudo borrar el cuadro eliminatorio: ${errorBorrar.message}`
    );
  }

  const { error: errorBorrarLegacy } = await supabase
    .from("partidos")
    .delete()
    .eq("torneo_id", filtro.torneo_id)
    .eq("categoria", filtro.categoria)
    .is("tipo_fase", null)
    .in("fase", [...FASES_CUADRO_ELIMINATORIO])
    .neq("fase", "Clasificacion");

  if (errorBorrarLegacy) {
    throw new Error(
      `No se pudo borrar el cuadro heredado: ${errorBorrarLegacy.message}`
    );
  }
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
    .eq("categoria", categoria)
    .eq("fase", "Clasificacion");

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

function armarPartidosPrimeraRonda(
  jugadorIds: string[],
  torneo_id: string,
  categoria: string,
  fase: string
) {
  const n = jugadorIds.length;
  if (n < 2) {
    throw new Error(
      "Se necesitan al menos 2 jugadores para armar el cuadro eliminatorio."
    );
  }

  const slots = potenciaDeDosSuperior(n);
  if (slots > MAX_SLOTS_PRIMERA_RONDA) {
    throw new Error(
      `Hay ${n} jugadores para el cuadro; el máximo es ${MAX_SLOTS_PRIMERA_RONDA} (8 octavos).`
    );
  }

  const cantidadPartidos = slots / 2;
  const partidos: Array<
    ReturnType<typeof filaPartidoDesdePareja> & {
      tipo_fase: typeof TIPO_FASE_ELIMINATORIA;
      ronda: string;
      numero_slot: number;
    }
  > = [];
  let i = 0;
  let byeIndice = 0;
  let slot = 1;

  const crucesReales = n - cantidadPartidos;
  for (let m = 0; m < crucesReales; m += 1) {
    partidos.push({
      ...filaPartidoDesdePareja(
        torneo_id,
        categoria,
        fase,
        asientoJugadorId(jugadorIds[i]),
        asientoJugadorId(jugadorIds[i + 1])
      ),
      ...metadatosEliminatoria(fase, slot),
    });
    i += 2;
    slot += 1;
  }

  while (i < n) {
    partidos.push({
      ...filaPartidoDesdePareja(
        torneo_id,
        categoria,
        fase,
        asientoJugadorId(jugadorIds[i]),
        asientoByeSlot(byeIndice++)
      ),
      ...metadatosEliminatoria(fase, slot),
    });
    i += 1;
    slot += 1;
  }

  if (partidos.length !== cantidadPartidos) {
    throw new Error(
      `Se esperaban ${cantidadPartidos} partidos de primera ronda y se armaron ${partidos.length}.`
    );
  }

  return partidos;
}

/**
 * Purga el cuadro de la categoría y lo regenera desde la clasificación.
 * Nunca borra partidos de fase Clasificacion ni inscriptos.
 */
export async function generarCuadroFinal(
  torneo_id: string,
  categoria: string,
  jugadorIdsCategoria: string[]
): Promise<ResultadoGeneracionCruces> {
  const supabase = createClient();
  const idsCreados: string[] = [];
  const categoriaTorneo = categoria.trim();

  if (!categoriaTorneo) {
    throw new Error("Falta la categoría del torneo para armar el cuadro.");
  }

  if (jugadorIdsCategoria.length === 0) {
    throw new Error(
      "Seleccioná una categoría con inscriptos para armar el cuadro final."
    );
  }

  const { data, error } = await supabase
    .from("partidos")
    .select(
      "id, created_at, numero_slot, jugador_1_id, jugador_2_id, ganador_id, estado, categoria"
    )
    .eq("torneo_id", torneo_id)
    .eq("fase", "Clasificacion")
    .eq("categoria", categoriaTorneo)
    .order("numero_slot", { ascending: true })
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

  for (const partido of partidosClasificacion) {
    validarPartidoClasificacionCompleto(partido);
  }

  const idsEnQualy = new Set<string>();
  for (const partido of partidosClasificacion) {
    if (partido.jugador_1_id) idsEnQualy.add(partido.jugador_1_id);
    if (partido.jugador_2_id) idsEnQualy.add(partido.jugador_2_id);
  }
  const pasesDirectos = jugadorIdsCategoria.filter(
    (id) => !idsEnQualy.has(id)
  );

  const jugadores = jugadoresQueAvanzanDeClasificacion(
    partidosClasificacion,
    pasesDirectos
  );

  await purgarCuadroEliminatorioDeCategoria(torneo_id, categoriaTorneo);

  const cantidadPartidos = potenciaDeDosSuperior(jugadores.length) / 2;
  const rondas = rondasDelCuadro(cantidadPartidos);
  const fasePrimera = rondas[0];
  const primeraRonda = armarPartidosPrimeraRonda(
    jugadores,
    torneo_id,
    categoriaTorneo,
    fasePrimera
  );

  try {
    const idsRondaSiguiente = await crearRondasPosteriores(
      supabase,
      torneo_id,
      categoriaTorneo,
      rondas,
      idsCreados
    );

    const filasPrimera = primeraRonda.map((partido, indice) => ({
      ...partido,
      siguiente_partido_id:
        idsRondaSiguiente.length === 0
          ? null
          : idsRondaSiguiente[Math.floor(indice / 2)],
    }));

    const { data: primeraData, error: errorPrimera } = await supabase
      .from("partidos")
      .insert(filasPrimera)
      .select("id, ganador_id, siguiente_partido_id, estado");

    if (
      errorPrimera ||
      !primeraData ||
      primeraData.length !== filasPrimera.length
    ) {
      throw new Error(
        `No se pudieron crear los partidos de ${fasePrimera}: ${errorPrimera?.message ?? "cantidad inválida"}`
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
      primeraFase: fasePrimera,
    };
  } catch (error) {
    await rollbackPartidosCreados(supabase, idsCreados);
    throw error;
  }
}

export interface OpcionSlotCuadro {
  id: string;
  label: string;
}

export interface OpcionesCuadroManual {
  ganadoresQualy: OpcionSlotCuadro[];
  perdedoresQualy: OpcionSlotCuadro[];
  pasesDirectos: OpcionSlotCuadro[];
  otros: OpcionSlotCuadro[];
}

/** Opciones etiquetadas G/L/directos para el override manual del cuadro. */
export function construirOpcionesCuadroManual(
  partidosClasificacion: PartidoClasificacion[],
  idsInscriptosCategoria: string[],
  nombrePorId: Map<string, string>
): OpcionesCuadroManual {
  const ordenados = ordenarPartidosClasificacion(partidosClasificacion);
  const idsEnQualy = new Set<string>();
  const idsEtiquetados = new Set<string>();
  const ganadoresQualy: OpcionSlotCuadro[] = [];
  const perdedoresQualy: OpcionSlotCuadro[] = [];

  for (const [indice, partido] of ordenados.entries()) {
    if (partido.jugador_1_id) idsEnQualy.add(partido.jugador_1_id);
    if (partido.jugador_2_id) idsEnQualy.add(partido.jugador_2_id);

    if (partido.ganador_id) {
      idsEtiquetados.add(partido.ganador_id);
      ganadoresQualy.push({
        id: partido.ganador_id,
        label: `G${indice + 1} · ${nombrePorId.get(partido.ganador_id) ?? "Jugador"}`,
      });

      const perdedor = perdedorDePartidoClasificacion(partido);
      if (perdedor) {
        idsEtiquetados.add(perdedor);
        perdedoresQualy.push({
          id: perdedor,
          label: `L${indice + 1} · ${nombrePorId.get(perdedor) ?? "Jugador"}`,
        });
      }
    }
  }

  const pasesDirectos = idsInscriptosCategoria
    .filter((id) => !idsEnQualy.has(id))
    .map((id) => {
      idsEtiquetados.add(id);
      return {
        id,
        label: nombrePorId.get(id) ?? "Jugador",
      };
    });

  const otros = [...nombrePorId.entries()]
    .filter(([id]) => !idsEtiquetados.has(id))
    .map(([id, nombre]) => ({ id, label: nombre }));

  return { ganadoresQualy, perdedoresQualy, pasesDirectos, otros };
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
      throw new Error("La misma persona no puede jugar en ambos lados.");
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
          estado: "Pendiente",
          ...metadatosEliminatoria(fase, indice + 1),
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

export async function verificarColisionCancha(params: {
  partido_id: string;
  cancha: string;
  fecha_programada: string;
}): Promise<void> {
  const nuevoInicio = new Date(params.fecha_programada);
  if (Number.isNaN(nuevoInicio.getTime())) return;

  const nuevaFranja = franjaPartido(nuevoInicio.getTime());
  const ventanaDesde = new Date(
    nuevaFranja.inicioMs - DURACION_PARTIDO_MS
  ).toISOString();
  const ventanaHasta = new Date(nuevaFranja.finMs).toISOString();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("partidos")
    .select("id, fecha_programada")
    .eq("cancha", params.cancha)
    .neq("id", params.partido_id)
    .not("fecha_programada", "is", null)
    .gte("fecha_programada", ventanaDesde)
    .lte("fecha_programada", ventanaHasta);

  if (error) {
    throw new Error(
      `No se pudo verificar disponibilidad de la cancha: ${error.message}`
    );
  }

  const hayChoque = (data ?? []).some((partido) => {
    if (!partido.fecha_programada) return false;
    const existenteInicio = new Date(partido.fecha_programada).getTime();
    if (Number.isNaN(existenteInicio)) return false;
    return intervalosSeSolapan(nuevaFranja, franjaPartido(existenteInicio));
  });

  if (hayChoque) {
    throw new Error(mensajeCanchaOcupada(params.cancha));
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
    await verificarColisionCancha({
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
      ...(params.fecha_programada && params.cancha
        ? { suspendido_lluvia: false }
        : {}),
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
    throw new Error("Quién ganó tiene que ser uno de los dos lados del partido.");
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
