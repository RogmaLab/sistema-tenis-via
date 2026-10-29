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

/** Valor del <select> para un asiento pendiente ("Esperando rival / clasificación"). */
export const SLOT_POR_DEFINIR = "POR_DEFINIR";

export function esSlotPorDefinir(slotId: string | null | undefined) {
  return slotId === SLOT_POR_DEFINIR;
}

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

/**
 * Arma las entradas de primera ronda cruzando Ganadores (G) contra Perdedores (L)
 * de distintos cruces de clasificación, priorizando los partidos ya terminados
 * para que esos cruces del cuadro queden listos para programar de inmediato
 * aunque falten otros partidos de clasificación por jugar.
 */
function planificarEntradasPrimeraRonda(
  partidosClasificacion: PartidoClasificacion[],
  pasesDirectos: string[],
  jugadorIdsCategoria: string[]
): {
  entradas: (string | null)[];
  totalEsperados: number;
} {
  const ordenados = ordenarPartidosClasificacion(partidosClasificacion);
  if (ordenados.length === 0) {
    const unicos = [...new Set(jugadorIdsCategoria.filter(Boolean))];
    return {
      entradas: unicos,
      totalEsperados: unicos.length,
    };
  }

  const usados = new Set<string>();
  const reservarId = (id: string | null | undefined): string | null => {
    if (!id || usados.has(id)) return null;
    usados.add(id);
    return id;
  };

  const terminadosDosJugadores: {
    ganadorId: string;
    perdedorId: string;
  }[] = [];
  const otrosConocidos: string[] = [];
  let pendientesSlots = 0;

  for (const partido of ordenados) {
    const finalizado =
      partido.estado === "Finalizado" && Boolean(partido.ganador_id);

    if (esPartidoClasificacionBye(partido)) {
      const humano = ganadorHumanoClasificacionBye(partido);
      const id = reservarId(humano);
      if (id) otrosConocidos.push(id);
      else if (!finalizado) pendientesSlots += 1;
      continue;
    }

    if (finalizado && partido.ganador_id) {
      const perdedorRaw =
        partido.jugador_1_id === partido.ganador_id
          ? partido.jugador_2_id
          : partido.jugador_2_id === partido.ganador_id
            ? partido.jugador_1_id
            : null;
      const gId = reservarId(partido.ganador_id);
      const lId = reservarId(perdedorRaw);
      if (gId && lId) {
        terminadosDosJugadores.push({ ganadorId: gId, perdedorId: lId });
      } else {
        if (gId) otrosConocidos.push(gId);
        if (lId) otrosConocidos.push(lId);
      }
    } else {
      // Partido de clasificación pendiente: reserva 2 lugares en el cuadro (G y L)
      pendientesSlots += 2;
    }
  }

  for (const id of pasesDirectos) {
    const reservado = reservarId(id);
    if (reservado) otrosConocidos.push(reservado);
  }

  const entradas: (string | null)[] = [];
  const r = terminadosDosJugadores.length;

  if (r >= 2) {
    // Cruzamos Ganador del cruce i contra Perdedor del cruce (i + 1) % r
    // Ejemplo: Cruce 1 (G1/L1) y Cruce 3 (G3/L3) -> (G1 vs L3) y (G3 vs L1)
    for (let i = 0; i < r; i += 1) {
      const ganador = terminadosDosJugadores[i].ganadorId;
      const perdedorCruzado =
        terminadosDosJugadores[(i + 1) % r].perdedorId;
      entradas.push(ganador, perdedorCruzado);
    }
  } else if (r === 1) {
    const { ganadorId, perdedorId } = terminadosDosJugadores[0];
    if (otrosConocidos.length >= 2) {
      const rivalG = otrosConocidos.shift()!;
      const rivalL = otrosConocidos.shift()!;
      entradas.push(ganadorId, rivalG, perdedorId, rivalL);
    } else if (otrosConocidos.length === 1) {
      const rivalG = otrosConocidos.shift()!;
      entradas.push(ganadorId, rivalG);
      if (pendientesSlots > 0) {
        entradas.push(perdedorId, null);
        pendientesSlots -= 1;
      } else {
        entradas.push(perdedorId);
      }
    } else if (pendientesSlots >= 2) {
      // Separamos al ganador y perdedor del único cruce jugado para que esperen
      // rivales de los cruces pendientes en vez de volver a jugar entre sí.
      entradas.push(ganadorId, null, perdedorId, null);
      pendientesSlots -= 2;
    } else {
      entradas.push(ganadorId, perdedorId);
    }
  }

  for (const id of otrosConocidos) {
    entradas.push(id);
  }
  for (let i = 0; i < pendientesSlots; i += 1) {
    entradas.push(null);
  }

  return {
    entradas,
    totalEsperados: entradas.length,
  };
}

function filaPrimeraRondaDesdeEntradas(
  torneo_id: string,
  categoria: string,
  fase: string,
  slot: number,
  entrada1: string | null,
  entrada2: string | null,
  esSlotConBye: boolean
) {
  if (esSlotConBye) {
    // Es un asiento con BYE (pase libre a la siguiente ronda).
    // Si el jugador ya se conoce, avanza por W.O. Si todavía es null (esperando qualy),
    // queda Pendiente hasta que termine su partido de clasificación.
    if (entrada1) {
      return {
        torneo_id,
        categoria,
        jugador_1_id: entrada1,
        jugador_2_id: null,
        ganador_id: entrada1,
        resultado: "W.O.",
        estado: "Finalizado" as const,
        ...metadatosEliminatoria(fase, slot),
      };
    }
    return {
      torneo_id,
      categoria,
      jugador_1_id: null,
      jugador_2_id: null,
      ganador_id: null,
      resultado: null,
      estado: "Pendiente" as const,
      ...metadatosEliminatoria(fase, slot),
    };
  }

  // Es un cruce real entre 2 clasificados (pueden estar ambos definidos, uno o ninguno).
  return {
    torneo_id,
    categoria,
    jugador_1_id: entrada1,
    jugador_2_id: entrada2,
    ganador_id: null,
    resultado: null,
    estado: "Pendiente" as const,
    ...metadatosEliminatoria(fase, slot),
  };
}

function armarPartidosPrimeraRondaProgresiva(
  entradas: (string | null)[],
  torneo_id: string,
  categoria: string,
  fase: string
) {
  const n = entradas.length;
  if (n < 2) {
    throw new Error(
      "Se necesitan al menos 2 jugadores para armar el cuadro eliminatorio."
    );
  }

  const slots = potenciaDeDosSuperior(n);
  if (slots > MAX_SLOTS_PRIMERA_RONDA) {
    throw new Error(
      `Hay ${n} lugares para el cuadro; el máximo es ${MAX_SLOTS_PRIMERA_RONDA} (8 octavos).`
    );
  }

  const cantidadPartidos = slots / 2;
  const crucesReales = n - cantidadPartidos;
  const partidos: Array<
    ReturnType<typeof filaPrimeraRondaDesdeEntradas>
  > = [];

  let i = 0;
  let slot = 1;

  for (let m = 0; m < crucesReales; m += 1) {
    partidos.push(
      filaPrimeraRondaDesdeEntradas(
        torneo_id,
        categoria,
        fase,
        slot,
        entradas[i] ?? null,
        entradas[i + 1] ?? null,
        false
      )
    );
    i += 2;
    slot += 1;
  }

  while (i < n) {
    partidos.push(
      filaPrimeraRondaDesdeEntradas(
        torneo_id,
        categoria,
        fase,
        slot,
        entradas[i] ?? null,
        null,
        true
      )
    );
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
 * Purga el cuadro de la categoría y lo genera (o regenera) desde la clasificación.
 * Funciona tanto con toda la clasificación finalizada como con resultados parciales
 * (o incluso antes de cargar resultados), cruzando Ganador vs. Perdedor de distintos
 * cruces y dejando en "Esperando rival..." los lugares que aún se están jugando.
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

  const idsEnQualy = new Set<string>();
  for (const partido of partidosClasificacion) {
    if (partido.jugador_1_id) idsEnQualy.add(partido.jugador_1_id);
    if (partido.jugador_2_id) idsEnQualy.add(partido.jugador_2_id);
  }
  const pasesDirectos = jugadorIdsCategoria.filter(
    (id) => !idsEnQualy.has(id)
  );

  const { entradas, totalEsperados } = planificarEntradasPrimeraRonda(
    partidosClasificacion,
    pasesDirectos,
    jugadorIdsCategoria
  );

  if (totalEsperados < 2) {
    throw new Error(
      "Se necesitan al menos 2 participantes para armar el cuadro eliminatorio."
    );
  }

  await purgarCuadroEliminatorioDeCategoria(torneo_id, categoriaTorneo);

  const cantidadPartidos = potenciaDeDosSuperior(totalEsperados) / 2;
  const rondas = rondasDelCuadro(cantidadPartidos);
  const fasePrimera = rondas[0];
  const primeraRonda = armarPartidosPrimeraRondaProgresiva(
    entradas,
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

/**
 * Sincroniza el cuadro eliminatorio a medida que se cargan resultados en Clasificación:
 * - Si todavía no existe cuadro eliminatorio en la categoría, lo crea completo hasta la Final.
 * - Si existe pero todavía no hay cruces con los dos nombres, horario ni resultado,
 *   lo regenera con Ganador vs. Perdedor.
 * - Si ya hay cruces armados (a mano o por un armado anterior), no los pisa:
 *   solo completa sillas vacías.
 */
export async function sincronizarCuadroDesdeClasificacion(
  torneo_id: string,
  categoria: string,
  jugadorIdsCategoria: string[]
): Promise<{ actualizado: boolean }> {
  const supabase = createClient();
  const categoriaTorneo = categoria.trim();
  if (!categoriaTorneo || jugadorIdsCategoria.length < 2) {
    return { actualizado: false };
  }

  const { data: existentesData, error: errorExistentes } = await supabase
    .from("partidos")
    .select(
      "id, fase, tipo_fase, ronda, numero_slot, estado, resultado, ganador_id, cancha, fecha_programada, jugador_1_id, jugador_2_id, siguiente_partido_id"
    )
    .eq("torneo_id", torneo_id)
    .eq("categoria", categoriaTorneo)
    .neq("fase", "Clasificacion")
    .order("numero_slot", { ascending: true });

  if (errorExistentes) {
    throw new Error(
      `No se pudo verificar el cuadro eliminatorio: ${errorExistentes.message}`
    );
  }

  const existentes = existentesData ?? [];
  if (existentes.length === 0) {
    await generarCuadroFinal(torneo_id, categoriaTorneo, jugadorIdsCategoria);
    return { actualizado: true };
  }

  const cuadroYaArmadoAMano = existentes.some(
    (p) =>
      Boolean(p.jugador_1_id && p.jugador_2_id) ||
      Boolean(p.fecha_programada) ||
      Boolean(p.cancha) ||
      (p.estado === "Finalizado" && p.resultado !== "W.O.")
  );

  if (!cuadroYaArmadoAMano) {
    await generarCuadroFinal(torneo_id, categoriaTorneo, jugadorIdsCategoria);
    return { actualizado: true };
  }

  // Hay partidos programados o jugados en el cuadro: completamos solo los lugares
  // vacíos de primera ronda sin tocar los partidos ya programados/jugados.
  const { data: qualyData, error: errorQualy } = await supabase
    .from("partidos")
    .select(
      "id, created_at, numero_slot, jugador_1_id, jugador_2_id, ganador_id, estado, categoria"
    )
    .eq("torneo_id", torneo_id)
    .eq("fase", "Clasificacion")
    .eq("categoria", categoriaTorneo)
    .order("numero_slot", { ascending: true })
    .order("created_at", { ascending: true });

  if (errorQualy) {
    throw new Error(
      `No se pudieron leer los partidos de clasificación: ${errorQualy.message}`
    );
  }

  const partidosClasificacion = ordenarPartidosClasificacion(
    (qualyData as PartidoClasificacion[] | null) ?? []
  );

  const idsEnQualy = new Set<string>();
  for (const partido of partidosClasificacion) {
    if (partido.jugador_1_id) idsEnQualy.add(partido.jugador_1_id);
    if (partido.jugador_2_id) idsEnQualy.add(partido.jugador_2_id);
  }
  const pasesDirectos = jugadorIdsCategoria.filter(
    (id) => !idsEnQualy.has(id)
  );

  const { entradas, totalEsperados } = planificarEntradasPrimeraRonda(
    partidosClasificacion,
    pasesDirectos,
    jugadorIdsCategoria
  );

  const ordenRonda: Record<string, number> = {
    "Octavos de Final": 1,
    "Cuartos de Final": 2,
    Semifinal: 3,
    Final: 4,
  };

  const fasesPresentes = [...new Set(existentes.map((p) => (p.ronda ?? p.fase) as string))]
    .filter((f) => f in ordenRonda)
    .sort((a, b) => ordenRonda[a] - ordenRonda[b]);

  const fasePrimera = fasesPresentes[0];
  if (!fasePrimera) return { actualizado: false };

  const primeraRondaActual = existentes
    .filter((p) => (p.ronda ?? p.fase) === fasePrimera)
    .sort((a, b) => (a.numero_slot ?? 999) - (b.numero_slot ?? 999));

  const yaSentados = new Set<string>();
  for (const p of primeraRondaActual) {
    if (p.jugador_1_id) yaSentados.add(p.jugador_1_id);
    if (p.jugador_2_id) yaSentados.add(p.jugador_2_id);
  }

  const nuevosConocidos = entradas.filter(
    (id): id is string => id != null && !yaSentados.has(id)
  );

  if (nuevosConocidos.length === 0) {
    return { actualizado: false };
  }

  const cantidadPartidos = primeraRondaActual.length;
  const crucesReales = Math.max(0, totalEsperados - cantidadPartidos);
  let colaNuevos = [...nuevosConocidos];
  let huboCambios = false;

  // 1) Completar sillas vacías en los cruces reales (de 2 jugadores) que siguen Pendientes
  for (let idx = 0; idx < Math.min(crucesReales, primeraRondaActual.length); idx += 1) {
    if (colaNuevos.length === 0) break;
    const partido = primeraRondaActual[idx];
    if (partido.estado === "Finalizado") continue;

    let j1 = partido.jugador_1_id as string | null;
    let j2 = partido.jugador_2_id as string | null;
    let modificado = false;

    if (!j1 && colaNuevos.length > 0) {
      j1 = colaNuevos.shift()!;
      modificado = true;
    }
    if (!j2 && colaNuevos.length > 0) {
      j2 = colaNuevos.shift()!;
      modificado = true;
    }

    if (modificado) {
      const { error } = await supabase
        .from("partidos")
        .update({ jugador_1_id: j1, jugador_2_id: j2 })
        .eq("id", partido.id);
      if (!error) huboCambios = true;
    }
  }

  // 2) Completar los slots de BYE que estaban esperando a que termine la clasificación
  for (let idx = crucesReales; idx < primeraRondaActual.length; idx += 1) {
    if (colaNuevos.length === 0) break;
    const partido = primeraRondaActual[idx];
    if (partido.estado === "Finalizado" || partido.jugador_1_id || partido.jugador_2_id) {
      continue;
    }

    const jugadorBye = colaNuevos.shift()!;
    const { error } = await supabase
      .from("partidos")
      .update({
        jugador_1_id: jugadorBye,
        jugador_2_id: null,
        ganador_id: jugadorBye,
        resultado: "W.O.",
        estado: "Finalizado",
      })
      .eq("id", partido.id);

    if (!error) {
      huboCambios = true;
      await promoverGanadorAlSiguientePartido({
        siguiente_partido_id: partido.siguiente_partido_id as string | null,
        ganador_id: jugadorBye,
      });
    }
  }

  return { actualizado: huboCambios };
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

async function reabrirTorneoSiQuedoSinCampeon(
  supabase: ReturnType<typeof createClient>,
  torneo_id: string
) {
  const { count, error: errorConteo } = await supabase
    .from("partidos")
    .select("*", { count: "exact", head: true })
    .eq("torneo_id", torneo_id)
    .eq("fase", "Final")
    .eq("estado", "Finalizado")
    .not("ganador_id", "is", null);

  if (errorConteo) {
    throw new Error(
      `No se pudo verificar si queda un campeón: ${errorConteo.message}`
    );
  }
  if ((count ?? 0) > 0) return;

  const { error } = await supabase
    .from("torneos")
    .update({ estado: "activo", fecha_fin: null })
    .eq("id", torneo_id)
    .eq("estado", "finalizado");

  if (error) {
    throw new Error(`No se pudo reabrir el torneo: ${error.message}`);
  }
}

async function anularResultadoRecursivo(
  supabase: ReturnType<typeof createClient>,
  partidoId: string,
  visitados: Set<string>
) {
  if (visitados.has(partidoId)) return;
  visitados.add(partidoId);

  const { data: actual, error: errorActual } = await supabase
    .from("partidos")
    .select(
      "id, torneo_id, fase, jugador_1_id, jugador_2_id, ganador_id, resultado, estado, siguiente_partido_id"
    )
    .eq("id", partidoId)
    .maybeSingle();

  if (errorActual || !actual) {
    throw new Error(
      `No se pudo leer el partido: ${errorActual?.message ?? "no encontrado"}`
    );
  }

  const snapshot = actual as SnapshotPartido & { id: string };

  if (snapshot.siguiente_partido_id) {
    await anularResultadoRecursivo(
      supabase,
      snapshot.siguiente_partido_id,
      visitados
    );

    if (snapshot.ganador_id) {
      const { data: destino, error: errorDestino } = await supabase
        .from("partidos")
        .select("id, jugador_1_id, jugador_2_id")
        .eq("id", snapshot.siguiente_partido_id)
        .maybeSingle();

      if (errorDestino) {
        throw new Error(
          `No se pudo leer el partido siguiente: ${errorDestino.message}`
        );
      }

      if (destino) {
        const parche: {
          jugador_1_id?: null;
          jugador_2_id?: null;
        } = {};
        if (destino.jugador_1_id === snapshot.ganador_id) {
          parche.jugador_1_id = null;
        }
        if (destino.jugador_2_id === snapshot.ganador_id) {
          parche.jugador_2_id = null;
        }
        if (Object.keys(parche).length > 0) {
          const { error: errorDesasentar } = await supabase
            .from("partidos")
            .update(parche)
            .eq("id", destino.id);
          if (errorDesasentar) {
            throw new Error(
              `No se pudo sacar al ganador del partido siguiente: ${errorDesasentar.message}`
            );
          }
        }
      }
    }
  }

  const hayResultado =
    snapshot.estado === "Finalizado" ||
    Boolean(snapshot.ganador_id) ||
    Boolean(snapshot.resultado);

  if (hayResultado) {
    const { error: errorUpdate } = await supabase
      .from("partidos")
      .update({
        resultado: null,
        ganador_id: null,
        estado: "Pendiente",
      })
      .eq("id", partidoId);

    if (errorUpdate) {
      throw new Error(`No se pudo anular el resultado: ${errorUpdate.message}`);
    }
  }

  if (snapshot.fase === "Clasificacion") {
    const ids = [
      snapshot.jugador_1_id,
      snapshot.jugador_2_id,
      snapshot.ganador_id,
    ].filter((id): id is string => Boolean(id));
    for (const jugadorId of [...new Set(ids)]) {
      await sincronizarClasificadoPorVictoriasClasificacion(
        supabase,
        snapshot.torneo_id,
        jugadorId
      );
    }
  }

  if (snapshot.fase === "Final") {
    await reabrirTorneoSiQuedoSinCampeon(supabase, snapshot.torneo_id);
  }
}

/**
 * Vuelve el partido a Pendiente (sin resultado ni ganador).
 * Si el ganador ya había avanzado, también anula los partidos siguientes
 * y lo saca de esas sillas. Si era la Final, reabre el torneo.
 */
export async function anularResultadoPartido(params: {
  partido_id: string;
}): Promise<{ ok: true }> {
  const supabase = createClient();
  await anularResultadoRecursivo(
    supabase,
    params.partido_id,
    new Set<string>()
  );
  return { ok: true };
}

/**
 * Anula el resultado (y la cadena hacia la Final) y borra el partido.
 * Los que apuntaban acá quedan con siguiente_partido_id en null (FK).
 */
export async function eliminarPartido(params: {
  partido_id: string;
}): Promise<{ ok: true }> {
  const supabase = createClient();
  await anularResultadoRecursivo(
    supabase,
    params.partido_id,
    new Set<string>()
  );

  const { error } = await supabase
    .from("partidos")
    .delete()
    .eq("id", params.partido_id);

  if (error) {
    throw new Error(`No se pudo eliminar el partido: ${error.message}`);
  }

  return { ok: true };
}
