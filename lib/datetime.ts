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

// Convierte un timestamp ISO (lo que devuelve Supabase) al formato que
// espera el input `datetime-local` ("YYYY-MM-DDTHH:mm", en hora local del
// navegador). Función pura: mismo input, mismo output, sin efectos.
export function toDatetimeLocalValue(fechaHorario: string | null) {
  if (!fechaHorario) return "";

  const fecha = new Date(fechaHorario);
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
