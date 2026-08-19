export interface PartidoParaCuadro {
  id: string;
  resultado: string | null;
  estado: string;
  ganador_id: string | null;
  fase: string;
  fecha_horario: string | null;
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

const ORDEN_FASE: Record<string, number> = {
  "Octavos de Final": 1,
  "Cuartos de Final": 2,
  Semifinal: 3,
  Final: 4,
};

function esFaseDeCuadro(fase: string) {
  return (FASES_CUADRO as readonly string[]).includes(fase);
}

function idComoTexto(valor: string | number | null | undefined) {
  return valor == null ? "" : String(valor);
}

export function hayCuadroEliminatorio(partidos: PartidoParaCuadro[]) {
  return partidos.some((partido) => esFaseDeCuadro(partido.fase));
}

export function fasePrimeraRondaDelCuadro(partidos: PartidoParaCuadro[]) {
  for (const fase of FASES_CUADRO) {
    if (partidos.some((partido) => partido.fase === fase)) return fase;
  }
  return null;
}

export function partidosDeLaPrimeraRonda(partidos: PartidoParaCuadro[]) {
  const fase = fasePrimeraRondaDelCuadro(partidos);
  if (!fase) return [];
  return [...partidos]
    .filter((partido) => partido.fase === fase)
    .sort((a, b) => idComoTexto(a.id).localeCompare(idComoTexto(b.id)));
}

export const RONDA_CUADRO_LABELS: Record<string, string> = {
  "Octavos de Final": "Octavos de Final",
  "Cuartos de Final": "Cuartos de Final",
  Semifinal: "Semifinales",
  Final: "Final",
};

export function rondasActivasDelCuadro(partidos: PartidoParaCuadro[]) {
  const presentes = new Set(
    partidos.filter((partido) => esFaseDeCuadro(partido.fase)).map((p) => p.fase)
  );
  return FASES_CUADRO.filter((fase) => presentes.has(fase));
}

/** Primera ronda (en orden del cuadro) que todavía tiene partidos sin finalizar. */
export function rondaMasAvanzadaConActividad(partidos: PartidoParaCuadro[]) {
  const rondas = rondasActivasDelCuadro(partidos);
  if (rondas.length === 0) return null;

  for (const fase of rondas) {
    const deRonda = partidos.filter((partido) => partido.fase === fase);
    const sigueAbierta = deRonda.some(
      (partido) => partido.estado !== "Finalizado"
    );
    if (sigueAbierta) return fase;
  }

  return rondas[rondas.length - 1];
}

export function idsRondasPosterioresDe(
  partidos: PartidoParaCuadro[],
  faseActual: string
) {
  const ordenActual = ORDEN_FASE[faseActual] ?? 0;
  return partidos
    .filter(
      (partido) =>
        esFaseDeCuadro(partido.fase) &&
        (ORDEN_FASE[partido.fase] ?? 0) > ordenActual
    )
    .map((partido) => partido.id);
}

export function rondaAunNoHabilitada(
  partidos: PartidoParaCuadro[],
  fase: string
) {
  const deRonda = partidos.filter((partido) => partido.fase === fase);
  if (deRonda.length === 0) return true;
  return deRonda.every((partido) => !partido.jugador_1 && !partido.jugador_2);
}

function ordenarPartidosDeRonda(
  ronda: PartidoParaCuadro[],
  siguiente: PartidoParaCuadro[]
) {
  if (siguiente.length === 0) {
    return [...ronda].sort((a, b) =>
      idComoTexto(a.id).localeCompare(idComoTexto(b.id))
    );
  }

  const porDestino = new Map<string, PartidoParaCuadro[]>();
  const resto: PartidoParaCuadro[] = [];
  for (const partido of ronda) {
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
    const alimentan = porDestino.get(idComoTexto(destino.id)) ?? [];
    alimentan.sort((a, b) =>
      idComoTexto(a.id).localeCompare(idComoTexto(b.id))
    );
    ordenados.push(...alimentan);
    porDestino.delete(idComoTexto(destino.id));
  }
  for (const sobrantes of porDestino.values()) {
    ordenados.push(...sobrantes);
  }
  resto.sort((a, b) => idComoTexto(a.id).localeCompare(idComoTexto(b.id)));
  ordenados.push(...resto);
  return ordenados;
}

/** Columnas del árbol (primera ronda → Final), alineadas por `siguiente_partido_id`. */
export function columnasDelArbolCuadro(partidos: PartidoParaCuadro[]) {
  const rondas = rondasActivasDelCuadro(partidos);
  const columnas = rondas.map((fase) => ({
    fase,
    partidos: partidos.filter((partido) => partido.fase === fase),
  }));

  for (let i = columnas.length - 1; i >= 0; i--) {
    const siguiente = columnas[i + 1]?.partidos ?? [];
    columnas[i] = {
      ...columnas[i],
      partidos: ordenarPartidosDeRonda(columnas[i].partidos, siguiente),
    };
  }

  return columnas;
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
  const delCuadro = partidos.filter((partido) => esFaseDeCuadro(partido.fase));
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

  return delCuadro.filter((partido) => incluidos.has(idComoTexto(partido.id)));
}
