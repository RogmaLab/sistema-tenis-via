import { createClient } from "@/lib/supabase/client";

/** Fila de `torneo_jugadores` con el jugador embebido (solo lectura de ficha). */
export interface InscriptoTorneo {
  id: string;
  /** Columna `torneo_jugadores.categoria` — cuadro de ESTE torneo. */
  categoria_inscripcion: string;
  jugador: {
    id: string;
    nombre_completo: string;
    /** Ficha del club (`jugadores.categoria`). Solo lectura; no filtrar inscriptos por esto. */
    categoria: string;
    genero: string;
  };
}

/** Cuadro de ESTE torneo. Nunca lee `jugador.categoria`. */
export function categoriaDeInscripcion(
  inscripto: Pick<InscriptoTorneo, "categoria_inscripcion">
) {
  return inscripto.categoria_inscripcion.trim();
}

function normalizarInscriptoTorneo(
  fila: Record<string, unknown>
): InscriptoTorneo | null {
  const jugadorRaw = fila.jugador;
  if (!jugadorRaw || typeof jugadorRaw !== "object") return null;

  const jugador = jugadorRaw as {
    id?: string;
    nombre_completo?: string;
    categoria?: string;
    genero?: string;
  };
  if (!jugador.id) return null;

  // Alias PostgREST `categoria_inscripcion:categoria` → torneo_jugadores.categoria
  const crudo = fila.categoria_inscripcion;
  const categoria_inscripcion =
    typeof crudo === "string" ? crudo.trim() : "";

  return {
    id: String(fila.id),
    categoria_inscripcion,
    jugador: {
      id: jugador.id,
      nombre_completo: jugador.nombre_completo ?? "",
      categoria: jugador.categoria ?? "",
      genero: jugador.genero ?? "",
    },
  };
}

/**
 * Inscriptos de UN torneo. Solo filas en `torneo_jugadores` con `torneo_id` exacto.
 * Opcionalmente filtra por categoría de inscripción (no por `jugadores.categoria`).
 */
export async function fetchInscriptosTorneo(params: {
  torneoId: string;
  categoria?: string | null;
}): Promise<{ data: InscriptoTorneo[]; error: Error | null }> {
  const torneoId = params.torneoId.trim();
  if (!torneoId) {
    return { data: [], error: new Error("Falta el id del torneo.") };
  }

  const supabase = createClient();
  let consulta = supabase
    .from("torneo_jugadores")
    .select(
      "id, categoria_inscripcion:categoria, jugador:jugador_id ( id, nombre_completo, categoria, genero )"
    )
    .eq("torneo_id", torneoId);

  const categoriaTorneo = params.categoria?.trim();
  if (categoriaTorneo && categoriaTorneo !== "Todas") {
    consulta = consulta.eq("categoria", categoriaTorneo);
  }

  const { data, error } = await consulta.order("created_at", {
    ascending: true,
  });

  if (error) {
    console.error("Error al cargar inscriptos del torneo:", error.message);
    return { data: [], error: errorDeCategoria(error) };
  }

  const inscriptos = (data ?? [])
    .map((fila) => normalizarInscriptoTorneo(fila as Record<string, unknown>))
    .filter((fila): fila is InscriptoTorneo => fila !== null);

  return { data: inscriptos, error: null };
}

function esConflictoDeFila(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const codigo = error.code ?? "";
  const mensaje = (error.message ?? "").toLowerCase();
  return (
    codigo === "23505" ||
    mensaje.includes("duplicate") ||
    mensaje.includes("unique")
  );
}

function faltaColumnaCategoria(error: { message?: string } | null) {
  if (!error) return false;
  const mensaje = (error.message ?? "").toLowerCase();
  return (
    mensaje.includes("categoria") &&
    (mensaje.includes("schema cache") ||
      mensaje.includes("does not exist") ||
      mensaje.includes("could not find"))
  );
}

/** Insert bloqueado por unique (torneo_id, jugador_id) sin categoría en la DB. */
function faltaRestriccionPorCategoria(error: { message?: string } | null) {
  if (!error) return false;
  const mensaje = (error.message ?? "").toLowerCase();
  return (
    esConflictoDeFila(error) &&
    !mensaje.includes("torneo_jugadores_torneo_jugador_categoria_key") &&
    !mensaje.includes("categoria")
  );
}

function errorDeCategoria(error: { message?: string } | null): Error {
  if (faltaColumnaCategoria(error)) {
    return new Error(
      "Falta la columna categoria en torneo_jugadores. Ejecutá el SQL de supabase/torneo-jugadores-categoria.sql."
    );
  }
  return new Error(
    error?.message || "No se pudo guardar la inscripción en la base de datos."
  );
}

/**
 * Inscribe jugadores en una categoría de UN torneo.
 *
 * Escribe únicamente en `torneo_jugadores`:
 *   { torneo_id, jugador_id, categoria }  ← categoria = cuadro del torneo (ej. 4ta)
 *
 * Nunca lee ni escribe `jugadores.categoria` (ficha del club, ej. 3ra).
 * Ferrer sigue siendo 3ra en su perfil aunque se anote en 4ta de este torneo.
 */
export async function inscribirJugadoresEnTorneo(params: {
  torneoId: string;
  jugadorIds: string[];
  categoria: string;
}): Promise<{ ok: true; categoria: string; jugadorIds: string[] }> {
  const categoriaTorneo = params.categoria.trim();
  if (!categoriaTorneo) {
    throw new Error("Falta la categoría del torneo en la que se inscribe.");
  }
  if (params.jugadorIds.length === 0) {
    throw new Error("No hay nadie para inscribir.");
  }

  const supabase = createClient();

  const { data: yaEnEstaCategoria, error: errorExistentes } = await supabase
    .from("torneo_jugadores")
    .select("jugador_id")
    .eq("torneo_id", params.torneoId)
    .eq("categoria", categoriaTorneo)
    .in("jugador_id", params.jugadorIds);

  if (errorExistentes) throw errorDeCategoria(errorExistentes);

  const idsYaAnotados = new Set(
    (yaEnEstaCategoria ?? []).map((fila) => fila.jugador_id as string)
  );
  const idsAInscribir = params.jugadorIds.filter((id) => !idsYaAnotados.has(id));

  if (idsAInscribir.length > 0) {
    const filas = idsAInscribir.map((jugador_id) => ({
      torneo_id: params.torneoId,
      jugador_id,
      categoria: categoriaTorneo,
    }));

    const insert = await supabase
      .from("torneo_jugadores")
      .insert(filas)
      .select("id, jugador_id, categoria");

    if (insert.error) {
      if (esConflictoDeFila(insert.error)) {
        throw new Error(
          `Hay alguien que ya está inscripto en ${categoriaTorneo} de este torneo.`
        );
      }
      if (faltaRestriccionPorCategoria(insert.error)) {
        throw new Error(
          "La base aún usa unicidad (torneo, jugador) sin categoría. Ejecutá supabase/torneo-jugadores-unique-categoria.sql."
        );
      }
      throw errorDeCategoria(insert.error);
    }

    if (
      (insert.data ?? []).length !== idsAInscribir.length ||
      (insert.data ?? []).some(
        (fila) => (fila.categoria ?? "").trim() !== categoriaTorneo
      )
    ) {
      throw new Error(
        `La inscripción no quedó vinculada a ${categoriaTorneo}.`
      );
    }
  }

  const { data: verificados, error: errorVerificacion } = await supabase
    .from("torneo_jugadores")
    .select("jugador_id, categoria")
    .eq("torneo_id", params.torneoId)
    .eq("categoria", categoriaTorneo)
    .in("jugador_id", params.jugadorIds);

  if (errorVerificacion) throw errorDeCategoria(errorVerificacion);

  const idsConfirmados = new Set(
    (verificados ?? []).map((fila) => fila.jugador_id as string)
  );
  const noVinculados = params.jugadorIds.filter((id) => !idsConfirmados.has(id));
  if (noVinculados.length > 0) {
    throw new Error(
      `La inscripción no quedó registrada en ${categoriaTorneo} de este torneo.`
    );
  }

  return {
    ok: true,
    categoria: categoriaTorneo,
    jugadorIds: params.jugadorIds,
  };
}
