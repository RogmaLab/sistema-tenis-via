// Funciones puras de formateo/parseo de fechas, compartidas entre la vista
// de listado de torneos, el detalle de un torneo y la gestión de partidos
// (todas necesitan mostrar o editar fechas y horarios de la misma forma).

// Formatea una fecha (sin hora) para mostrarla en la UI, ej: "15 jul 2026".
export function formatFecha(fecha: string) {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Convierte un ISO/timestamp a Date local; devuelve null si es inválido.
function parseFechaProgramada(valor: string): Date | null {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function diaSemanaCorto(fecha: Date) {
  const dia = fecha
    .toLocaleDateString("es-AR", { weekday: "short" })
    .replace(".", "");
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}`;
}

function diaMesNumerico(fecha: Date) {
  return `${fecha.getDate()}/${fecha.getMonth() + 1}`;
}

function horaProgramacion(fecha: Date) {
  return fecha.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Formato unificado de programación: "Sáb 5/9 18:30 hs" */
function formatFechaHoraPartido(fecha: Date) {
  return `${diaSemanaCorto(fecha)} ${diaMesNumerico(fecha)} ${horaProgramacion(fecha)} hs`;
}

// Formatea un timestamp ISO (con hora) para mostrarlo en la UI, ej:
// "Sáb 5/9 18:30 hs".
export function formatFechaHorario(fechaHorario: string) {
  const fecha = parseFechaProgramada(fechaHorario);
  if (!fecha) return "";
  return formatFechaHoraPartido(fecha);
}

/** Formato badge de programación en tarjetas: "Sáb 5/9 18:30 hs" */
export function formatProgramacionPartido(fechaProgramada: string) {
  const fecha = parseFechaProgramada(fechaProgramada);
  if (!fecha) return "";
  return formatFechaHoraPartido(fecha);
}

/** Formato compacto para cuadro y perfil: "Sáb 5/9 18:30 hs" */
export function formatFechaCuadro(fechaProgramada: string | null | undefined) {
  if (!fechaProgramada) return "";
  return formatProgramacionPartido(fechaProgramada);
}

// Convierte un timestamp ISO al formato del input `datetime-local`.
export function toDatetimeLocalValue(fechaProgramada: string | null) {
  if (!fechaProgramada) return "";

  const fecha = new Date(fechaProgramada);
  if (Number.isNaN(fecha.getTime())) return "";

  const pad = (valor: number) => String(valor).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
}

// Inversa de toDatetimeLocalValue: toma el valor crudo del input
// (interpretado como hora local) y lo convierte a un ISO string en UTC,
// listo para guardar en una columna "timestamp with time zone".
export function fromDatetimeLocalValue(valor: string): string | null {
  if (!valor) return null;

  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

export function toDateInputValue(fechaProgramada: string | null) {
  const local = toDatetimeLocalValue(fechaProgramada);
  return local ? local.slice(0, 10) : "";
}

export function toTimeInputValue(fechaProgramada: string | null) {
  const local = toDatetimeLocalValue(fechaProgramada);
  return local ? local.slice(11, 16) : "";
}

const padHora = (valor: number) => String(valor).padStart(2, "0");

/** Horas 00–23 para el modal de programación. */
export const HORAS_PROGRAMACION = Array.from({ length: 24 }, (_, indice) =>
  padHora(indice)
);

/** Únicos minutos válidos en cancha: en punto o y media. */
export const MINUTOS_PROGRAMACION = ["00", "30"] as const;

/**
 * Normaliza "HH:MM" a hora en punto o y media (09:00 / 09:30).
 * Minutos 0–29 → :00; 30–59 → :30.
 */
export function snapHoraAMediaHora(hora: string): string {
  const match = /^(\d{1,2})(?::(\d{1,2}))?/.exec(hora.trim());
  if (!match) return "00:00";

  const horas = Math.min(23, Math.max(0, Number.parseInt(match[1], 10)));
  const minutosLeidos = Number.parseInt(match[2] ?? "0", 10);
  const minutos =
    Number.isFinite(minutosLeidos) && minutosLeidos >= 30 ? 30 : 0;

  return `${padHora(horas)}:${padHora(minutos)}`;
}

/** Junta date + time locales en un ISO para `partidos.fecha_programada`. */
export function fromDateAndTimeValues(
  fecha: string,
  hora: string
): string | null {
  if (!fecha) return null;
  return fromDatetimeLocalValue(
    `${fecha}T${snapHoraAMediaHora(hora || "00:00")}`
  );
}
