// Fase 1 - Entidades core del sistema de gestión de torneos de tenis.
// Estos tipos reflejan (a futuro) el esquema de las tablas en Supabase,
// por eso los ids son `string` (uuid) y las fechas se manejan como
// strings en formato ISO (YYYY-MM-DD), tal como las devolvería Postgres/Supabase.

export type EstadoTorneo = "inscripcion" | "activo" | "finalizado";

export type FormatoTorneo =
  | "eliminacion_directa"
  | "grupos_eliminatoria"
  | "clasificacion_eliminatoria";

export const FORMATOS_TORNEO: FormatoTorneo[] = [
  "eliminacion_directa",
  "grupos_eliminatoria",
  "clasificacion_eliminatoria",
];

export const FORMATO_TORNEO_LABELS: Record<FormatoTorneo, string> = {
  eliminacion_directa: "Eliminación Directa",
  grupos_eliminatoria: "Fase de Grupos + Eliminatoria",
  clasificacion_eliminatoria: "Fase de Clasificación + Eliminación Directa",
};

const FORMATOS_LEGACY: Record<string, FormatoTorneo> = {
  "Eliminación Directa": "eliminacion_directa",
  "Zonas + Llaves": "grupos_eliminatoria",
  "2 Partidos Garantizados": "clasificacion_eliminatoria",
  nivelacion_oro_plata: "clasificacion_eliminatoria",
  "Por definir": "eliminacion_directa",
};

/** Normaliza el formato guardado (incluye labels viejos de la UI). */
export function normalizarFormatoTorneo(
  formato: string | null | undefined
): FormatoTorneo {
  if (!formato) return "eliminacion_directa";
  if (FORMATOS_TORNEO.includes(formato as FormatoTorneo)) {
    return formato as FormatoTorneo;
  }
  return FORMATOS_LEGACY[formato] ?? "eliminacion_directa";
}

// Coincide exactamente con las columnas de la tabla "torneos" en Supabase.
// `categorias` es un array de texto (una o más de CATEGORIAS_JUGADOR) y
// `formato` queda como `string` por el mismo motivo que en Jugador: es una
// columna de texto libre en la base, sin enum a nivel de Postgres.
// `fecha_apertura_inscripcion`/`fecha_cierre_inscripcion` son el período
// de inscripción (el cierre incluye hora: ver calcularEstadoVisual).
// `fecha_inicio` es el arranque previsto del torneo. `fecha_fin` queda
// nulleable a propósito: no se pide al crear (las lluvias atrasan partidos)
// y se completa automáticamente el día en que se consagra un campeón
// (resultado de un partido con fase "Final").
export interface Torneo {
  id: string;
  nombre: string;
  fecha_inicio: string; // ISO date string, ej: "2026-09-01"
  fecha_fin: string | null; // ISO date; se setea al coronar campeón
  fecha_apertura_inscripcion: string | null; // ISO date string
  fecha_cierre_inscripcion: string | null; // ISO datetime string (timestamptz)
  categorias: string[];
  formato: string;
  estado: EstadoTorneo;
  created_at: string;
}

export type CategoriaJugador =
  | "1ra"
  | "2da"
  | "3ra"
  | "4ta"
  | "5ta"
  | "6ta"
  | "4ta/5ta Caballeros"
  | "4ta/5ta Damas";

export const CATEGORIAS_JUGADOR: CategoriaJugador[] = [
  "1ra",
  "2da",
  "3ra",
  "4ta",
  "5ta",
  "6ta",
  "4ta/5ta Caballeros",
  "4ta/5ta Damas",
];

export type Genero = "Masculino" | "Femenino";

export const GENEROS: Genero[] = ["Masculino", "Femenino"];

// Coincide exactamente con las columnas de la tabla "jugadores" en Supabase.
// `categoria` y `genero` quedan como `string` (no como los union types de
// arriba) porque así es como llegan desde la base: columnas de texto libre,
// sin un enum/check constraint que garantice los valores en tiempo de
// compilación. Los arrays CATEGORIAS_JUGADOR/GENEROS siguen siendo la fuente
// de verdad para poblar los <select> del formulario.
export interface Jugador {
  id: string;
  nombre_completo: string;
  whatsapp: string;
  categoria: string;
  genero: string;
}

// Jugador con los puntos de ranking ya calculados a partir del historial
// real de torneo_jugadores (participaciones) y partidos (victorias).
export interface JugadorRanking extends Jugador {
  participaciones: number;
  partidosGanados: number;
  puntos: number;
}

// Tabla intermedia que relaciona jugadores con el torneo en el que están
// inscriptos (relación muchos a muchos entre "torneos" y "jugadores").
export interface TorneoJugador {
  id: string;
  torneo_id: string;
  jugador_id: string;
  categoria: string | null;
  created_at: string;
}

export type EstadoPartido = "Pendiente" | "Finalizado";

export type FasePartido =
  | "Clasificacion"
  | "Fase de Grupos"
  | "Octavos de Final"
  | "Cuartos de Final"
  | "Semifinal"
  | "Final";

export const FASES_PARTIDO: FasePartido[] = [
  "Clasificacion",
  "Fase de Grupos",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinal",
  "Final",
];

// Nombres de cancha del club. Al igual que categoria/genero en Jugador, es
// solo la fuente de verdad para poblar el <select>: la columna real en
// Supabase (tabla "partidos") es texto libre, así que alcanza con agregar
// un ítem acá si el club suma más canchas.
export const CANCHAS_TORNEO = ["Cancha 1", "Cancha 2"];

// Coincide con las columnas de la tabla "partidos" en Supabase.
// jugador_1_id/jugador_2_id/ganador_id son FKs a "jugadores", lo que permite
// pedirle a Supabase que devuelva los datos del jugador ya embebidos con
// `.select("*, jugador_1:jugador_1_id(...)")` en vez de hacer joins manuales.
// En el cuadro de eliminación, Cuartos/Semi/Final nacen con jugadores null
// y se van llenando al avanzar; siguiente_partido_id encadena el árbol
// (el ganador de este cruce pasa a ese partido).
export interface Partido {
  id: string;
  torneo_id: string;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
  ganador_id: string | null;
  resultado: string | null;
  estado: EstadoPartido;
  fase: string;
  cancha: string | null;
  fecha_horario: string | null; // ISO datetime string (timestamptz), ej: "2026-09-12T18:30:00.000Z"
  siguiente_partido_id: string | null;
  created_at: string;
}
