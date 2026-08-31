export interface PartidoParaCuadro {
  id: string;
  resultado: string | null;
  estado: string;
  ganador_id: string | null;
  fase: string;
  tipo_fase?: string | null;
  ronda?: string | null;
  numero_slot?: number | null;
  fecha_programada: string | null;
  suspendido_lluvia?: boolean;
  siguiente_partido_id: string | null;
  jugador_1: { id: string; nombre_completo: string } | null;
  jugador_2: { id: string; nombre_completo: string } | null;
}

const FASES_CUADRO = [
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinal",
  "Final",
] as const;

const ORDEN_RONDA: Record<string, number> = {
  "Octavos de Final": 1,
  "Cuartos de Final": 2,
  Semifinal: 3,
  Final: 4,
};

export function esFaseDeCuadro(fase: string) {
  return (FASES_CUADRO as readonly string[]).includes(fase);
}

/** Espejo temporal: `fase` sigue existiendo, pero tipo_fase/ronda son la fuente. */
export function metadatosDesdeFaseEspejo(fase: string) {
  if (fase === "Clasificacion") {
    return {
      tipo_fase: "clasificacion" as const,
      ronda: null as string | null,
    };
  }
  if (fase === "Fase de Grupos") {
    return {
      tipo_fase: "grupos" as const,
      ronda: null as string | null,
    };
  }
  if (esFaseDeCuadro(fase)) {
    return {
      tipo_fase: "eliminatoria" as const,
      ronda: fase,
    };
  }
  return {};
}

export function esPartidoEliminatorio(partido: {
  tipo_fase?: string | null;
  fase: string;
}) {
  if (partido.tipo_fase === "eliminatoria") return true;
  if (
    partido.tipo_fase === "clasificacion" ||
    partido.tipo_fase === "grupos"
  ) {
    return false;
  }
  return esFaseDeCuadro(partido.fase);
}

export function esPartidoClasificacion(partido: {
  tipo_fase?: string | null;
  fase: string;
}) {
  if (partido.tipo_fase === "clasificacion") return true;
  if (
    partido.tipo_fase === "eliminatoria" ||
    partido.tipo_fase === "grupos"
  ) {
    return false;
  }
  return partido.fase === "Clasificacion";
}

/** Ronda persistida; si falta, espejo temporal en `fase`. */
export function rondaDelPartido(partido: {
  ronda?: string | null;
  fase: string;
}) {
  const ronda = partido.ronda?.trim();
  return ronda ? ronda : partido.fase;
}

export function ordenarPorNumeroSlot<T extends { numero_slot?: number | null }>(
  partidos: T[]
): T[] {
  return [...partidos].sort((a, b) => {
    const sa = a.numero_slot ?? Number.MAX_SAFE_INTEGER;
    const sb = b.numero_slot ?? Number.MAX_SAFE_INTEGER;
    return sa - sb;
  });
}

function idComoTexto(valor: string | number | null | undefined) {
  return valor == null ? "" : String(valor);
}

export function hayCuadroEliminatorio(partidos: PartidoParaCuadro[]) {
  return partidos.some((partido) => esPartidoEliminatorio(partido));
}

export function fasePrimeraRondaDelCuadro(partidos: PartidoParaCuadro[]) {
  const delCuadro = partidos.filter(esPartidoEliminatorio);
  for (const ronda of FASES_CUADRO) {
    if (delCuadro.some((partido) => rondaDelPartido(partido) === ronda)) {
      return ronda;
    }
  }
  return null;
}

export function partidosDeLaPrimeraRonda(partidos: PartidoParaCuadro[]) {
  const ronda = fasePrimeraRondaDelCuadro(partidos);
  if (!ronda) return [];
  return ordenarPorNumeroSlot(
    partidos.filter(
      (partido) =>
        esPartidoEliminatorio(partido) && rondaDelPartido(partido) === ronda
    )
  );
}

export const RONDA_CUADRO_LABELS: Record<string, string> = {
  "Octavos de Final": "Octavos de Final",
  "Cuartos de Final": "Cuartos de Final",
  Semifinal: "Semifinales",
  Final: "Final",
};

export function rondasActivasDelCuadro(partidos: PartidoParaCuadro[]) {
  const presentes = new Set(
    partidos.filter(esPartidoEliminatorio).map((partido) => rondaDelPartido(partido))
  );
  return FASES_CUADRO.filter((ronda) => presentes.has(ronda));
}

/** Primera ronda (en orden del cuadro) que todavía tiene partidos sin finalizar. */
export function rondaMasAvanzadaConActividad(partidos: PartidoParaCuadro[]) {
  const rondas = rondasActivasDelCuadro(partidos);
  if (rondas.length === 0) return null;

  for (const ronda of rondas) {
    const deRonda = partidos.filter(
      (partido) =>
        esPartidoEliminatorio(partido) && rondaDelPartido(partido) === ronda
    );
    const sigueAbierta = deRonda.some(
      (partido) => partido.estado !== "Finalizado"
    );
    if (sigueAbierta) return ronda;
  }

  return rondas[rondas.length - 1];
}

export function idsRondasPosterioresDe(
  partidos: PartidoParaCuadro[],
  faseActual: string
) {
  const ordenActual = ORDEN_RONDA[faseActual] ?? 0;
  return partidos
    .filter((partido) => {
      if (!esPartidoEliminatorio(partido)) return false;
      return (ORDEN_RONDA[rondaDelPartido(partido)] ?? 0) > ordenActual;
    })
    .map((partido) => partido.id);
}

export function rondaAunNoHabilitada(
  partidos: PartidoParaCuadro[],
  fase: string
) {
  const deRonda = partidos.filter(
    (partido) =>
      esPartidoEliminatorio(partido) && rondaDelPartido(partido) === fase
  );
  if (deRonda.length === 0) return true;
  return deRonda.every((partido) => !partido.jugador_1 && !partido.jugador_2);
}

function ordenarPartidosDeRonda(
  ronda: PartidoParaCuadro[],
  siguiente: PartidoParaCuadro[]
) {
  const porSlot = ordenarPorNumeroSlot(ronda);
  if (siguiente.length === 0) {
    return porSlot;
  }

  const porDestino = new Map<string, PartidoParaCuadro[]>();
  const resto: PartidoParaCuadro[] = [];
  for (const partido of porSlot) {
    const dest = idComoTexto(partido.siguiente_partido_id);
    if (!dest) {
      resto.push(partido);
      continue;
    }
    const lista = porDestino.get(dest) ?? [];
    lista.push(partido);
    porDestino.set(dest, lista);
  }

  const ordenados: PartidoParaCuadro[] = [];
  for (const destino of siguiente) {
    const alimentan = ordenarPorNumeroSlot(
      porDestino.get(idComoTexto(destino.id)) ?? []
    );
    ordenados.push(...alimentan);
    porDestino.delete(idComoTexto(destino.id));
  }
  for (const sobrantes of porDestino.values()) {
    ordenados.push(...ordenarPorNumeroSlot(sobrantes));
  }
  ordenados.push(...resto);
  return ordenados;
}

/** Columnas del árbol: solo partidos persistidos, ordenados por numero_slot. */
export function columnasDelArbolCuadro(partidos: PartidoParaCuadro[]) {
  const delCuadro = partidos.filter(esPartidoEliminatorio);
  const rondas = rondasActivasDelCuadro(delCuadro);
  const columnas = rondas.map((ronda) => ({
    fase: ronda,
    partidos: ordenarPorNumeroSlot(
      delCuadro.filter((partido) => rondaDelPartido(partido) === ronda)
    ),
  }));

  for (let i = columnas.length - 1; i >= 0; i--) {
    const siguiente = columnas[i + 1]?.partidos ?? [];
    columnas[i] = {
      ...columnas[i],
      partidos: ordenarPartidosDeRonda(columnas[i].partidos, siguiente),
    };
  }

  return columnas.filter((columna) => columna.partidos.length > 0);
}

/**
 * Recorta el cuadro a la categoría actual: parte de los partidos
 * eliminatorios que ya tienen jugadores de ese grupo y sigue
 * `siguiente_partido_id` hasta la Final (aunque aún no tenga gente).
 */
export function partidosDelCuadroPorJugadores(
  partidos: PartidoParaCuadro[],
  jugadorIds: string[]
): PartidoParaCuadro[] {
  const idsJugadores = new Set(jugadorIds);
  const delCuadro = partidos.filter(esPartidoEliminatorio);
  const semillas = delCuadro.filter((partido) => {
    const j1 = partido.jugador_1?.id;
    const j2 = partido.jugador_2?.id;
    return Boolean(
      (j1 && idsJugadores.has(j1)) || (j2 && idsJugadores.has(j2))
    );
  });

  const incluidos = new Set(
    semillas.map((partido) => idComoTexto(partido.id))
  );
  let agrego = true;
  while (agrego) {
    agrego = false;
    for (const partido of delCuadro) {
      const id = idComoTexto(partido.id);
      if (!incluidos.has(id)) continue;
      const siguiente = partido.siguiente_partido_id
        ? idComoTexto(partido.siguiente_partido_id)
        : "";
      if (siguiente && !incluidos.has(siguiente)) {
        incluidos.add(siguiente);
        agrego = true;
      }
    }
  }

  return ordenarPorNumeroSlot(
    delCuadro.filter((partido) => incluidos.has(idComoTexto(partido.id)))
  );
}
