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

// Formatea un timestamp ISO (con hora) para mostrarlo en la UI, ej:
// "12 sep · 18:30hs".
export function formatFechaHorario(fechaHorario: string) {
  const fecha = new Date(fechaHorario);
  const fechaTexto = fecha.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
  const horaTexto = fecha.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${fechaTexto} · ${horaTexto}hs`;
}

/** Formato badge de programación: "Sáb 10:00 hs" */
export function formatProgramacionPartido(fechaProgramada: string) {
  const fecha = new Date(fechaProgramada);
  if (Number.isNaN(fecha.getTime())) return "";

  const dia = fecha
    .toLocaleDateString("es-AR", { weekday: "short" })
    .replace(".", "");
  const hora = fecha.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${hora} hs`;
}

/** Formato compacto 24h para el bracket: "23 Feb, 22:00 hs" */
export function formatFechaCuadro(fechaProgramada: string | null | undefined) {
  if (!fechaProgramada) return "";

  const fecha = new Date(fechaProgramada);
  if (Number.isNaN(fecha.getTime())) return "";

  const meses = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const pad = (valor: number) => String(valor).padStart(2, "0");

  return `${fecha.getDate()} ${meses[fecha.getMonth()]}, ${pad(fecha.getHours())}:${pad(fecha.getMinutes())} hs`;
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

/** Junta date + time locales en un ISO para `partidos.fecha_programada`. */
export function fromDateAndTimeValues(
  fecha: string,
  hora: string
): string | null {
  if (!fecha) return null;
  return fromDatetimeLocalValue(`${fecha}T${hora || "00:00"}`);
}
