import type { EstadoTorneo, Torneo } from "./types";

export const ESTADO_LABELS: Record<EstadoTorneo, string> = {
  inscripcion: "Inscripción abierta",
  activo: "Torneo en curso",
  finalizado: "Finalizado",
};

export const ESTADO_BADGE_STYLES: Record<EstadoTorneo, string> = {
  inscripcion: "bg-accent/15 text-accent",
  activo: "bg-yellow-500/15 text-yellow-500",
  finalizado: "bg-foreground/10 text-foreground/50",
};

// Estado "visual" que se muestra en pantalla.
// - "finalizado": se setea en la base al cargar el resultado de la Final
//   (campeón coronado → +10 pts en ranking). Tiene prioridad sobre todo.
// - Mientras el torneo sigue en "inscripcion", si ya se cumplió
//   `fecha_cierre_inscripcion` se muestra como "Torneo en curso".
// Función pura: se puede llamar directo en el render.
export function calcularEstadoVisual(torneo: Torneo): EstadoTorneo {
  if (torneo.estado !== "inscripcion") return torneo.estado;

  const yaCerroInscripcion =
    torneo.fecha_cierre_inscripcion !== null &&
    new Date(torneo.fecha_cierre_inscripcion).getTime() <= Date.now();

  return yaCerroInscripcion ? "activo" : "inscripcion";
}
