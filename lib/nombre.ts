const PLACEHOLDERS = new Set([
  "bye",
  "por definir",
  "esperando rival...",
  "sin asignar",
  "rival a definir",
  "sin nombre",
  "jugador",
]);

function limpiarParte(valor: string | null | undefined): string {
  return (valor ?? "").trim().replace(/\s+/g, " ");
}

export function esNombrePlaceholder(valor: string | null | undefined): boolean {
  return PLACEHOLDERS.has(limpiarParte(valor).toLowerCase());
}

/**
 * Formato canónico de display: Apellido + Nombre.
 * - `formatearNombre("Facundo Vigil")` → `"Vigil Facundo"`
 * - `formatearNombre("Facundo", "Vigil")` / `getNombreCompleto("Facundo", "Vigil")` → `"Vigil Facundo"`
 *
 * No altera placeholders (BYE, Por definir, etc.).
 */
export function formatearNombre(
  nombreOCompleto: string | null | undefined,
  apellido?: string | null | undefined
): string {
  const apellidoLimpio = limpiarParte(apellido);
  const nombreLimpio = limpiarParte(nombreOCompleto);

  if (apellidoLimpio) {
    return [apellidoLimpio, nombreLimpio].filter(Boolean).join(" ");
  }

  if (!nombreLimpio) return "";
  if (esNombrePlaceholder(nombreLimpio)) return nombreLimpio;

  const partes = nombreLimpio.split(" ");
  if (partes.length === 1) return partes[0];

  const apellidoInferido = partes[partes.length - 1];
  const nombres = partes.slice(0, -1).join(" ");
  return `${apellidoInferido} ${nombres}`;
}

export function getNombreCompleto(
  nombre: string | null | undefined,
  apellido: string | null | undefined
): string {
  return formatearNombre(nombre, apellido);
}

export function nombreJugador(
  jugador:
    | { nombre_completo?: string | null }
    | string
    | null
    | undefined,
  fallback = ""
): string {
  const crudo =
    typeof jugador === "string" ? jugador : jugador?.nombre_completo;
  if (!crudo?.trim()) return fallback;
  return formatearNombre(crudo);
}

export function compararNombres(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  return formatearNombre(a).localeCompare(formatearNombre(b), "es", {
    sensitivity: "base",
  });
}
