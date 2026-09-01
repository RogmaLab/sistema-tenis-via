/**
 * Nivel de categoría para ranking.
 * Número más alto = categoría más fuerte (1ra > 2da > 3ra > 4ta > 5ta > 6ta).
 * Damas se compara solo dentro de su familia.
 */

export type FamiliaCategoria = "caballeros" | "damas";

const NIVEL_CABALLEROS: Record<string, number> = {
  "1ra": 6,
  "2da": 5,
  "3ra": 4,
  "4ta": 3,
  "5ta": 2,
  "6ta": 1,
  "4ta/5ta Caballeros": 2,
};

const NIVEL_DAMAS: Record<string, number> = {
  Damas: 3,
  "4ta/5ta Damas": 1,
};

export function normalizarCategoria(valor: string | null | undefined): string {
  return (valor ?? "").trim();
}

export function familiaYNivelCategoria(categoria: string | null | undefined): {
  familia: FamiliaCategoria;
  nivel: number;
} | null {
  const clave = normalizarCategoria(categoria);
  if (!clave) return null;
  if (clave in NIVEL_CABALLEROS) {
    return { familia: "caballeros", nivel: NIVEL_CABALLEROS[clave] };
  }
  if (clave in NIVEL_DAMAS) {
    return { familia: "damas", nivel: NIVEL_DAMAS[clave] };
  }
  return null;
}

/**
 * True si el cuadro del torneo es de un nivel inferior a la ficha del jugador
 * (ej: ficha 3ra anotado en 4ta / 5ta). Esas estadísticas no entran al ranking.
 */
export function categoriaCuadroEsInferior(
  categoriaFicha: string | null | undefined,
  categoriaCuadro: string | null | undefined
): boolean {
  const ficha = familiaYNivelCategoria(categoriaFicha);
  const cuadro = familiaYNivelCategoria(categoriaCuadro);
  if (!ficha || !cuadro) return false;
  if (ficha.familia !== cuadro.familia) return true;
  return cuadro.nivel < ficha.nivel;
}

/** La estadística cuenta para el ranking de la ficha del jugador. */
export function statsCuentanParaRanking(
  categoriaFicha: string | null | undefined,
  categoriaCuadro: string | null | undefined
): boolean {
  return !categoriaCuadroEsInferior(categoriaFicha, categoriaCuadro);
}
