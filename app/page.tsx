export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { CarteleraHome } from "./cartelera-home";
import { fetchRankingCircuito } from "@/lib/ranking-datos";
import type { Torneo } from "@/lib/types";

export default async function Home() {
  const supabase = await createClient();

  const [ranking, torneosResult] = await Promise.all([
    fetchRankingCircuito(supabase),
    supabase
      .from("torneos")
      .select("id, nombre, estado, fecha_inicio, formato")
      .order("fecha_inicio", { ascending: false }),
  ]);

  if (torneosResult.error) {
    console.error(
      "Error al cargar torneos para la cartelera:",
      torneosResult.error.message
    );
  }

  const torneos = (torneosResult.data as Pick<
    Torneo,
    "id" | "nombre" | "estado" | "fecha_inicio" | "formato"
  >[]) ?? [];

  return <CarteleraHome ranking={ranking} torneos={torneos} />;
}
