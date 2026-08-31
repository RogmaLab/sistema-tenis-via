export type MedioPagoInscripcion = "transferencia" | "efectivo";

export const DESCUENTO_EFECTIVO = 0.1;

export function calcularPrecioEfectivo(precioBase: number): number {
  if (!Number.isFinite(precioBase) || precioBase <= 0) return 0;
  return Math.round(precioBase * (1 - DESCUENTO_EFECTIVO) * 100) / 100;
}

export function formatearPrecioAr(precio: number): string {
  return precio.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function etiquetaMedioPago(medio: MedioPagoInscripcion | null | undefined) {
  if (medio === "efectivo") return "Efectivo en el club (10% off)";
  return "Transferencia";
}
