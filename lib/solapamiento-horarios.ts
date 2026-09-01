/** Duración fija de un partido para ocupación de cancha. */
export const DURACION_PARTIDO_MINUTOS = 90;
export const DURACION_PARTIDO_MS = DURACION_PARTIDO_MINUTOS * 60 * 1000;

export type IntervaloMs = {
  inicioMs: number;
  finMs: number;
};

/** Franja ocupada: [inicio, inicio + 90 min). */
export function franjaPartido(inicioMs: number): IntervaloMs {
  return { inicioMs, finMs: inicioMs + DURACION_PARTIDO_MS };
}

/**
 * Dos intervalos semiabiertos [A_inicio, A_fin) y [B_inicio, B_fin)
 * se superponen solo si A_inicio < B_fin y B_inicio < A_fin.
 * Si uno termina exactamente cuando empieza el otro, no hay choque.
 */
export function intervalosSeSolapan(a: IntervaloMs, b: IntervaloMs): boolean {
  return a.inicioMs < b.finMs && b.inicioMs < a.finMs;
}

export function mensajeCanchaOcupada(cancha: string): string {
  return `La ${cancha} ya está ocupada en ese horario.`;
}
