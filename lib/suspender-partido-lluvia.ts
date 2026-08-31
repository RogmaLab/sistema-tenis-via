import { createClient } from "@/lib/supabase/client";

export async function suspenderPartidoPorLluvia(
  partidoId: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("partidos")
    .update({
      fecha_programada: null,
      cancha: null,
      suspendido_lluvia: true,
    })
    .eq("id", partidoId);

  if (error) {
    throw new Error(error.message || "No se pudo suspender el partido.");
  }
}
