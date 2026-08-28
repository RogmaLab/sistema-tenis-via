/**
 * Utilidades para el manejo de fechas y deadline de disponibilidad horaria.
 * 
 * REGLA DE NEGOCIO:
 * - La disponibilidad se puede modificar hasta el jueves a las 22:00
 * - Desde jueves 22:01 hasta domingo noche, queda bloqueada
 */

/**
 * Calcula el próximo sábado a partir de la fecha actual.
 */
export function calcularProximoSabado(): Date {
  const hoy = new Date();
  const diaSemana = hoy.getDay(); // 0 = Domingo, 6 = Sábado
  
  let diasHastaSabado: number;
  
  if (diaSemana === 6) {
    // Hoy es sábado: próximo sábado es en 7 días
    diasHastaSabado = 7;
  } else if (diaSemana === 0) {
    // Hoy es domingo: próximo sábado es en 6 días
    diasHastaSabado = 6;
  } else {
    // Lunes a viernes: calcular días hasta el sábado
    diasHastaSabado = 6 - diaSemana;
  }
  
  const proximoSabado = new Date(hoy);
  proximoSabado.setDate(hoy.getDate() + diasHastaSabado);
  proximoSabado.setHours(0, 0, 0, 0);
  
  return proximoSabado;
}

/**
 * Calcula el próximo domingo (siempre es el día después del próximo sábado).
 */
export function calcularProximoDomingo(): Date {
  const proximoSabado = calcularProximoSabado();
  const proximoDomingo = new Date(proximoSabado);
  proximoDomingo.setDate(proximoSabado.getDate() + 1);
  
  return proximoDomingo;
}

/**
 * Formatea una fecha en formato corto: "29/8" o "29/08"
 */
export function formatearFechaCorta(fecha: Date): string {
  const dia = fecha.getDate();
  const mes = fecha.getMonth() + 1;
  
  return `${dia}/${mes}`;
}

/**
 * Calcula el deadline (jueves a las 22:00) del próximo fin de semana.
 */
export function calcularDeadline(): Date {
  const proximoSabado = calcularProximoSabado();
  
  // El deadline es el jueves anterior al próximo sábado
  const deadline = new Date(proximoSabado);
  deadline.setDate(proximoSabado.getDate() - 2); // 2 días antes del sábado = jueves
  deadline.setHours(22, 0, 0, 0); // 22:00:00
  
  return deadline;
}

/**
 * Verifica si estamos dentro del período permitido para modificar disponibilidad.
 * 
 * @returns true si se puede modificar, false si el deadline ya pasó
 */
export function puedeModificarDisponibilidad(): boolean {
  const ahora = new Date();
  const deadline = calcularDeadline();
  
  // Si aún no llegó el deadline, se puede modificar
  if (ahora < deadline) {
    return true;
  }
  
  // Si ya pasó el deadline, verificar si ya pasó el domingo
  const proximoDomingo = calcularProximoDomingo();
  const finDomingo = new Date(proximoDomingo);
  finDomingo.setHours(23, 59, 59, 999);
  
  // Si ya pasó el domingo completo, se puede modificar para el SIGUIENTE fin de semana
  return ahora > finDomingo;
}

/**
 * Obtiene un mensaje descriptivo del estado del deadline.
 */
export function obtenerMensajeDeadline(): string {
  const deadline = calcularDeadline();
  const diaSemana = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const nombreDia = diaSemana[deadline.getDay()];
  const fechaFormateada = formatearFechaCorta(deadline);
  
  return `El período para modificar la disponibilidad de este fin de semana cerró el ${nombreDia} ${fechaFormateada} a las 22:00 hs. Los horarios ya están siendo procesados por la organización.`;
}

/**
 * Formatea una fecha completa con día de la semana.
 * Ejemplo: "Jueves 27/8"
 */
export function formatearDeadlineCompleto(): string {
  const deadline = calcularDeadline();
  const diaSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const nombreDia = diaSemana[deadline.getDay()];
  const fechaFormateada = formatearFechaCorta(deadline);
  
  return `${nombreDia} ${fechaFormateada} a las 22:00`;
}
