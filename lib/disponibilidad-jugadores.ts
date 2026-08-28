import type { BloqueHorario } from "@/lib/types";
import type { DiaFinDeSemana } from "@/lib/disponibilidad-canchas";

/**
 * Obtiene el día y rango de horas de un bloque horario
 */
export function infoBloque(bloque: BloqueHorario): {
  dia: DiaFinDeSemana;
  horaInicio: number; // Minutos desde medianoche
  horaFin: number;
} {
  const mapeo: Record<
    BloqueHorario,
    { dia: DiaFinDeSemana; horaInicio: number; horaFin: number }
  > = {
    sabado_manana: { dia: "sabado", horaInicio: 8 * 60, horaFin: 13 * 60 },
    sabado_tarde: { dia: "sabado", horaInicio: 13 * 60, horaFin: 18 * 60 },
    sabado_noche: { dia: "sabado", horaInicio: 18 * 60, horaFin: 22 * 60 },
    domingo_manana: { dia: "domingo", horaInicio: 8 * 60, horaFin: 13 * 60 },
    domingo_tarde: { dia: "domingo", horaInicio: 13 * 60, horaFin: 18 * 60 },
    domingo_noche: { dia: "domingo", horaInicio: 18 * 60, horaFin: 22 * 60 },
  };
  return mapeo[bloque];
}

/**
 * Determina el bloque horario de una fecha y hora específica
 */
export function bloqueDeHora(
  dia: DiaFinDeSemana,
  hora: string // "HH:MM"
): BloqueHorario | null {
  const [hh, mm] = hora.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  
  const minutos = hh * 60 + mm;
  
  if (dia === "sabado") {
    if (minutos >= 8 * 60 && minutos < 13 * 60) return "sabado_manana";
    if (minutos >= 13 * 60 && minutos < 18 * 60) return "sabado_tarde";
    if (minutos >= 18 * 60 && minutos < 22 * 60) return "sabado_noche";
  } else if (dia === "domingo") {
    if (minutos >= 8 * 60 && minutos < 13 * 60) return "domingo_manana";
    if (minutos >= 13 * 60 && minutos < 18 * 60) return "domingo_tarde";
    if (minutos >= 18 * 60 && minutos < 22 * 60) return "domingo_noche";
  }
  
  return null;
}

/**
 * Encuentra los bloques horarios comunes entre dos o más jugadores
 */
export function bloquesComunes(
  disponibilidades: (BloqueHorario[] | null | undefined)[]
): BloqueHorario[] {
  const disponibilidadesValidas = disponibilidades.filter(
    (d): d is BloqueHorario[] => Array.isArray(d) && d.length > 0
  );
  
  if (disponibilidadesValidas.length === 0) return [];
  if (disponibilidadesValidas.length === 1) return disponibilidadesValidas[0];
  
  const sets = disponibilidadesValidas.map((d) => new Set(d));
  const primero = sets[0];
  const comunes: BloqueHorario[] = [];
  
  for (const bloque of primero) {
    if (sets.every((set) => set.has(bloque))) {
      comunes.push(bloque);
    }
  }
  
  return comunes;
}

/**
 * Verifica si una hora específica está dentro de los bloques disponibles de un jugador
 */
export function estaDisponibleEnHora(
  disponibilidad: BloqueHorario[] | null | undefined,
  dia: DiaFinDeSemana,
  hora: string // "HH:MM"
): boolean {
  if (!disponibilidad || disponibilidad.length === 0) {
    // Sin disponibilidad declarada = disponible todo el tiempo (compatibilidad)
    return true;
  }
  
  const bloqueRequerido = bloqueDeHora(dia, hora);
  if (!bloqueRequerido) return false;
  
  return disponibilidad.includes(bloqueRequerido);
}

/**
 * Verifica si dos jugadores tienen disponibilidad común en una hora específica
 */
export function tienenDisponibilidadComun(
  disp1: BloqueHorario[] | null | undefined,
  disp2: BloqueHorario[] | null | undefined,
  dia: DiaFinDeSemana,
  hora: string
): boolean {
  return (
    estaDisponibleEnHora(disp1, dia, hora) &&
    estaDisponibleEnHora(disp2, dia, hora)
  );
}
