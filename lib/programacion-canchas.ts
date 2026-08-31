import { createClient } from "@/lib/supabase/client";
import {
  timePgAHora,
  type ConfigProgramacionTorneo,
  type VentanaCancha,
} from "@/lib/disponibilidad-canchas";
import {
  bloquesHabilitadosDesdeVentanas,
} from "@/lib/disponibilidad-jugadores";
import type { BloqueHorario } from "@/lib/types";
import {
  autoAsignarHorarios,
  fechasProximoFinDeSemana,
  generarBloquesHorarios,
  type OcupacionExistente,
  type PartidoParaAsignar,
} from "@/lib/auto-asignar-horarios";
import { esJugadorHumano } from "@/lib/motor-ranking";

export async function fetchConfigProgramacion(
  torneoId: string
): Promise<ConfigProgramacionTorneo | null> {
  const supabase = createClient();
  const [configResult, ventanasResult] = await Promise.all([
    supabase
      .from("config_programacion_torneo")
      .select("torneo_id, duracion_minutos, disponibilidad_abierta, disponibilidad_habilitada_at")
      .eq("torneo_id", torneoId)
      .maybeSingle(),
    supabase
      .from("disponibilidad_canchas")
      .select("dia, cancha, hora_inicio, hora_fin")
      .eq("torneo_id", torneoId)
      .order("hora_inicio", { ascending: true })
      .order("cancha", { ascending: true }),
  ]);

  if (configResult.error) {
    throw new Error(configResult.error.message);
  }
  if (ventanasResult.error) {
    throw new Error(ventanasResult.error.message);
  }

  const ventanas: VentanaCancha[] = (ventanasResult.data ?? []).map((fila) => ({
    dia: fila.dia as VentanaCancha["dia"],
    cancha: fila.cancha,
    hora_inicio: timePgAHora(fila.hora_inicio),
    hora_fin: timePgAHora(fila.hora_fin),
  }));

  if (!configResult.data && ventanas.length === 0) return null;

  return {
    torneo_id: torneoId,
    duracion_minutos: (configResult.data?.duracion_minutos === 60
      ? 60
      : 90) as 60 | 90,
    ventanas,
    disponibilidad_abierta: configResult.data?.disponibilidad_abierta ?? false,
    disponibilidad_habilitada_at:
      configResult.data?.disponibilidad_habilitada_at ?? null,
  };
}

export async function guardarConfigProgramacion(
  config: ConfigProgramacionTorneo,
  opciones?: { preservarEstadoApertura?: boolean }
): Promise<void> {
  const supabase = createClient();

  let disponibilidadAbierta = config.disponibilidad_abierta ?? false;
  let disponibilidadHabilitadaAt = config.disponibilidad_habilitada_at ?? null;

  if (opciones?.preservarEstadoApertura) {
    const { data: actual } = await supabase
      .from("config_programacion_torneo")
      .select("disponibilidad_abierta, disponibilidad_habilitada_at")
      .eq("torneo_id", config.torneo_id)
      .maybeSingle();
    if (actual) {
      disponibilidadAbierta = actual.disponibilidad_abierta ?? false;
      disponibilidadHabilitadaAt = actual.disponibilidad_habilitada_at ?? null;
    }
  }

  const { error: errorConfig } = await supabase
    .from("config_programacion_torneo")
    .upsert({
      torneo_id: config.torneo_id,
      duracion_minutos: config.duracion_minutos,
      disponibilidad_abierta: disponibilidadAbierta,
      disponibilidad_habilitada_at: disponibilidadHabilitadaAt,
      updated_at: new Date().toISOString(),
    });
  if (errorConfig) throw new Error(errorConfig.message);

  const { error: errorBorrar } = await supabase
    .from("disponibilidad_canchas")
    .delete()
    .eq("torneo_id", config.torneo_id);
  if (errorBorrar) throw new Error(errorBorrar.message);

  if (config.ventanas.length === 0) return;

  const { error: errorInsert } = await supabase
    .from("disponibilidad_canchas")
    .insert(
      config.ventanas.map((ventana) => ({
        torneo_id: config.torneo_id,
        dia: ventana.dia,
        cancha: ventana.cancha,
        hora_inicio: ventana.hora_inicio,
        hora_fin: ventana.hora_fin,
      }))
    );
  if (errorInsert) throw new Error(errorInsert.message);
}

export async function ejecutarAutoAsignacion(params: {
  torneoId: string;
  reasignarProgramados?: boolean;
}): Promise<{
  asignados: number;
  sinSlot: number;
  sinDisponibilidad: number;
  omitidos: number;
  bloques: number;
  partidosSinDisponibilidad: Array<{
    id: string;
    jugador_1: string | null;
    jugador_2: string | null;
    fase: string;
  }>;
}> {
  const supabase = createClient();
  const config = await fetchConfigProgramacion(params.torneoId);
  if (!config || config.ventanas.length === 0) {
    throw new Error(
      "Primero guardá la disponibilidad de canchas para el fin de semana."
    );
  }

  const { data: partidosData, error } = await supabase
    .from("partidos")
    .select(
      `id, estado, tipo_fase, fase, ronda, numero_slot, categoria, 
       jugador_1_id, jugador_2_id, fecha_programada, cancha,
       jugador_1:jugador_1_id(disponibilidad_horaria),
       jugador_2:jugador_2_id(disponibilidad_horaria)`
    )
    .eq("torneo_id", params.torneoId);

  if (error) throw new Error(error.message);

  const partidos = (partidosData ?? []).map((p: any) => ({
    id: p.id,
    estado: p.estado,
    tipo_fase: p.tipo_fase,
    fase: p.fase,
    ronda: p.ronda,
    numero_slot: p.numero_slot,
    categoria: p.categoria,
    jugador_1_id: p.jugador_1_id,
    jugador_2_id: p.jugador_2_id,
    fecha_programada: p.fecha_programada,
    cancha: p.cancha,
    jugador_1_disponibilidad: p.jugador_1?.disponibilidad_horaria ?? [],
    jugador_2_disponibilidad: p.jugador_2?.disponibilidad_horaria ?? [],
  })) as PartidoParaAsignar[];

  const duracionMs = config.duracion_minutos * 60 * 1000;
  const reasignar = params.reasignarProgramados === true;
  const ocupaciones: OcupacionExistente[] = [];

  for (const partido of partidos) {
    if (!partido.fecha_programada) continue;
    const seReasigna = reasignar && partido.estado !== "Finalizado";
    if (seReasigna) continue;
    const inicio = new Date(partido.fecha_programada);
    if (Number.isNaN(inicio.getTime())) continue;
    const jugadores = [partido.jugador_1_id, partido.jugador_2_id].filter(
      (id): id is string => esJugadorHumano(id)
    );
    ocupaciones.push({
      partidoId: partido.id,
      cancha: partido.cancha,
      inicioMs: inicio.getTime(),
      finMs: inicio.getTime() + duracionMs,
      jugadorIds: jugadores,
    });
  }

  const fechas = fechasProximoFinDeSemana();
  const bloques = generarBloquesHorarios({
    ventanas: config.ventanas,
    fechas,
    duracionMinutos: config.duracion_minutos,
  });

  const resultado = autoAsignarHorarios({
    partidos,
    bloques,
    ocupaciones,
    reasignarProgramados: reasignar,
  });

  const escrituras = await Promise.all(
    resultado.asignaciones.map((asignacion) =>
      supabase
        .from("partidos")
        .update({
          cancha: asignacion.cancha,
          fecha_programada: asignacion.fecha_programada,
        })
        .eq("id", asignacion.id)
    )
  );
  const errorEscritura = escrituras.find((item) => item.error)?.error;
  if (errorEscritura) throw new Error(errorEscritura.message);

  const { data: jugadoresData } = await supabase
    .from("jugadores")
    .select("id, nombre_completo")
    .in(
      "id",
      resultado.sinDisponibilidad.flatMap((p) => [p.jugador_1_id, p.jugador_2_id])
    );

  const jugadoresMap = new Map(
    (jugadoresData ?? []).map((j: any) => [j.id, j.nombre_completo])
  );

  const partidosSinDisponibilidad = resultado.sinDisponibilidad.map((p) => ({
    id: p.id,
    jugador_1: jugadoresMap.get(p.jugador_1_id!) ?? null,
    jugador_2: jugadoresMap.get(p.jugador_2_id!) ?? null,
    fase: p.fase,
  }));

  return {
    asignados: resultado.asignaciones.length,
    sinSlot: resultado.sinSlot.length,
    sinDisponibilidad: resultado.sinDisponibilidad.length,
    omitidos: resultado.omitidos,
    bloques: bloques.length,
    partidosSinDisponibilidad,
  };
}

export interface EstadoDisponibilidadJugadores {
  abierta: boolean;
  torneoId: string | null;
  torneoNombre: string | null;
  bloquesHabilitados: BloqueHorario[];
}

export async function fetchEstadoDisponibilidadParaJugadores(): Promise<EstadoDisponibilidadJugadores> {
  const supabase = createClient();

  const { data: configAbierta, error } = await supabase
    .from("config_programacion_torneo")
    .select("torneo_id, torneos(nombre)")
    .eq("disponibilidad_abierta", true)
    .order("disponibilidad_habilitada_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!configAbierta) {
    return {
      abierta: false,
      torneoId: null,
      torneoNombre: null,
      bloquesHabilitados: [],
    };
  }

  const torneoRaw = configAbierta.torneos as
    | { nombre: string }
    | { nombre: string }[]
    | null;
  const torneoNombre = Array.isArray(torneoRaw)
    ? torneoRaw[0]?.nombre ?? null
    : torneoRaw?.nombre ?? null;

  const config = await fetchConfigProgramacion(configAbierta.torneo_id);

  return {
    abierta: true,
    torneoId: configAbierta.torneo_id,
    torneoNombre,
    bloquesHabilitados: bloquesHabilitadosDesdeVentanas(config?.ventanas ?? []),
  };
}

export async function habilitarDisponibilidadJugadores(
  config: ConfigProgramacionTorneo
): Promise<void> {
  const supabase = createClient();
  const ahora = new Date().toISOString();

  const { error: errorCerrarOtros } = await supabase
    .from("config_programacion_torneo")
    .update({ disponibilidad_abierta: false })
    .neq("torneo_id", config.torneo_id)
    .eq("disponibilidad_abierta", true);

  if (errorCerrarOtros) throw new Error(errorCerrarOtros.message);

  const { error: errorConfig } = await supabase
    .from("config_programacion_torneo")
    .upsert({
      torneo_id: config.torneo_id,
      duracion_minutos: config.duracion_minutos,
      disponibilidad_abierta: true,
      disponibilidad_habilitada_at: ahora,
      updated_at: ahora,
    });

  if (errorConfig) throw new Error(errorConfig.message);

  const { error: errorBorrar } = await supabase
    .from("disponibilidad_canchas")
    .delete()
    .eq("torneo_id", config.torneo_id);
  if (errorBorrar) throw new Error(errorBorrar.message);

  if (config.ventanas.length === 0) return;

  const { error: errorInsert } = await supabase
    .from("disponibilidad_canchas")
    .insert(
      config.ventanas.map((ventana) => ({
        torneo_id: config.torneo_id,
        dia: ventana.dia,
        cancha: ventana.cancha,
        hora_inicio: ventana.hora_inicio,
        hora_fin: ventana.hora_fin,
      }))
    );
  if (errorInsert) throw new Error(errorInsert.message);
}

export async function fetchTorneosConConfiguracion(
  excluirTorneoId?: string
): Promise<Array<{ id: string; nombre: string }>> {
  const supabase = createClient();

  const { data: configs, error: errorConfigs } = await supabase
    .from("config_programacion_torneo")
    .select("torneo_id");

  if (errorConfigs) throw new Error(errorConfigs.message);

  const ids = (configs ?? [])
    .map((item) => item.torneo_id)
    .filter((id) => id !== excluirTorneoId);

  if (ids.length === 0) return [];

  const { data: torneos, error: errorTorneos } = await supabase
    .from("torneos")
    .select("id, nombre")
    .in("id", ids)
    .order("fecha_inicio", { ascending: false });

  if (errorTorneos) throw new Error(errorTorneos.message);
  return torneos ?? [];
}
