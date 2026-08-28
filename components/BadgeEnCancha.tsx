"use client";

interface BadgeEnCanchaProps {
  compacto?: boolean;
  className?: string;
}

export function BadgeEnCancha({ compacto = false, className = "" }: BadgeEnCanchaProps) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full bg-red-500 ${
        compacto ? "px-2 py-0.5" : "px-2.5 py-1"
      } ${className}`}
    >
      {/* Punto parpadeante */}
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white"></span>
      </span>
      
      {/* Texto */}
      <span
        className={`font-bold uppercase tracking-wide text-white ${
          compacto ? "text-[10px]" : "text-xs"
        }`}
      >
        EN CANCHA
      </span>
    </div>
  );
}

/**
 * Determina si un partido está actualmente "en cancha".
 * 
 * Un partido está "en cancha" si:
 * 1. Tiene fecha programada
 * 2. La fecha programada es hoy
 * 3. La hora actual está dentro de la ventana del partido (hora inicio hasta 2 horas después)
 * 4. El estado NO es "Finalizado"
 */
export function estaEnCancha(params: {
  fechaProgramada: string | null | undefined;
  estado: string;
}): boolean {
  const { fechaProgramada, estado } = params;

  // No está en cancha si no hay fecha programada
  if (!fechaProgramada) return false;

  // No está en cancha si ya finalizó
  if (estado === "Finalizado") return false;

  const ahora = new Date();
  const fechaPartido = new Date(fechaProgramada);

  // Verificar que sea el mismo día
  const esMismoDia =
    fechaPartido.getFullYear() === ahora.getFullYear() &&
    fechaPartido.getMonth() === ahora.getMonth() &&
    fechaPartido.getDate() === ahora.getDate();

  if (!esMismoDia) return false;

  // Calcular ventana del partido (hora inicio hasta 2 horas después)
  const horaInicio = fechaPartido.getTime();
  const horaFin = horaInicio + 2 * 60 * 60 * 1000; // +2 horas en milisegundos

  // Verificar si estamos dentro de la ventana
  const horaActual = ahora.getTime();
  return horaActual >= horaInicio && horaActual <= horaFin;
}
