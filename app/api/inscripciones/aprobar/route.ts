import { NextResponse } from "next/server";
import { aprobarInscripcionConNotificacion } from "@/lib/inscripciones-aprobacion";
import { createClient } from "@/lib/supabase/server";

async function esAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return false;

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  return perfil?.rol === "admin";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    if (!(await esAdmin(supabase))) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    const body = (await request.json()) as { inscripcionId?: string };
    const inscripcionId = body.inscripcionId?.trim();

    if (!inscripcionId) {
      return NextResponse.json(
        { error: "Falta el identificador de la inscripción." },
        { status: 400 }
      );
    }

    const resultado = await aprobarInscripcionConNotificacion(
      supabase,
      inscripcionId
    );

    return NextResponse.json({
      ok: true,
      ...resultado,
    });
  } catch (error) {
    console.error("Error al aprobar inscripción:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo aprobar la inscripción.",
      },
      { status: 500 }
    );
  }
}
