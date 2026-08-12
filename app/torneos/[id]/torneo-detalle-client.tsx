"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Pencil,
  Shuffle,
  Trash2,
  Trophy,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  actualizarResultadoPartidoConPropagacion,
  generarCrucesClasificacion,
  generarCuadroFinal,
} from "@/lib/motor-torneo";
import {
  CANCHAS_TORNEO,
  FASES_PARTIDO,
  type EstadoPartido,
  type Jugador,
  type Torneo,
} from "@/lib/types";
import { ESTADO_BADGE_STYLES, ESTADO_LABELS, calcularEstadoVisual } from "@/lib/torneo-estado";
import {
  formatFecha,
  formatFechaHorario,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/datetime";
import { hayCuadroEliminatorio } from "@/lib/adaptar-cuadro-torneo";
import { CuadroTorneo } from "@/components/CuadroTorneo";
import { useAuth } from "@/components/auth-provider";

const ESTADO_PARTIDO_BADGE_STYLES: Record<EstadoPartido, string> = {
  Pendiente: "bg-accent/15 text-accent",
  Finalizado: "bg-foreground/10 text-foreground/50",
};

// Fila de la tabla intermedia "torneo_jugadores" con los datos del jugador
// embebidos gracias a la FK jugador_id -> jugadores.id (select anidado de
// Supabase/PostgREST, sin necesidad de un join manual en el cliente).
interface Inscripto {
  id: string;
  jugador: {
    id: string;
    nombre_completo: string;
    categoria: string;
    genero: string;
  };
}

// Fila de "partidos" con jugador_1 / jugador_2 embebidos vía sus FKs.
interface PartidoConJugadores {
  id: string;
  resultado: string | null;
  estado: EstadoPartido;
  ganador_id: string | null;
  fase: string;
  cancha: string | null;
  fecha_horario: string | null;
  siguiente_partido_id: string | null;
  jugador_1: { id: string; nombre_completo: string } | null;
  jugador_2: { id: string; nombre_completo: string } | null;
}

// Marcador de un set: games de cada jugador como texto (input controlado),
// vacío mientras no se cargó. El tercer set es opcional (super tie-break).
interface SetScore {
  j1: string;
  j2: string;
}

const SETS_VACIOS: SetScore[] = [
  { j1: "", j2: "" },
  { j1: "", j2: "" },
  { j1: "", j2: "" },
];

export function TorneoDetalleClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const torneoId = params.id;
  const supabase = createClient();

  const [torneo, setTorneo] = useState<Torneo | null>(null);
  const [isLoadingTorneo, setIsLoadingTorneo] = useState(true);

  const [inscriptos, setInscriptos] = useState<Inscripto[]>([]);
  const [isLoadingInscriptos, setIsLoadingInscriptos] = useState(true);
  const [todosLosJugadores, setTodosLosJugadores] = useState<Jugador[]>([]);

  const [partidos, setPartidos] = useState<PartidoConJugadores[]>([]);
  const [isLoadingPartidos, setIsLoadingPartidos] = useState(true);
  const [isGenerandoCruces, setIsGenerandoCruces] = useState(false);
  const [isGenerandoCuadro, setIsGenerandoCuadro] = useState(false);

  const [isModalInscribirOpen, setIsModalInscribirOpen] = useState(false);
  const [partidoCargandoResultado, setPartidoCargandoResultado] =
    useState<PartidoConJugadores | null>(null);
  const [setsResultado, setSetsResultado] = useState<SetScore[]>(SETS_VACIOS);
  // Solo se setea cuando el usuario toca explícitamente un jugador para
  // corregir el ganador a mano (ej. retiro a mitad de partido). El ganador
  // "real" que se usa en pantalla y al guardar es el derivado más abajo
  // (ganadorManualId si existe, si no el calculado automáticamente).
  const [ganadorManualId, setGanadorManualId] = useState<string | null>(null);
  const [partidoEditando, setPartidoEditando] =
    useState<PartidoConJugadores | null>(null);

  // Fetchers "puros": solo consultan Supabase y devuelven el resultado (o
  // `null` si hubo error), sin tocar ningún estado. Sirven de base tanto
  // para la carga inicial (más abajo) como para los `cargarX` que usan los
  // handlers para recargar después de una mutación.
  const fetchTorneoDesdeSupabase = useCallback(async () => {
    const { data, error } = await supabase
      .from("torneos")
      .select("*")
      .eq("id", torneoId)
      .maybeSingle();

    if (error) {
      console.error("Error al cargar el torneo:", error.message);
      return null;
    }

    return (data as Torneo) ?? null;
  }, [torneoId, supabase]);

  const fetchInscriptosDesdeSupabase = useCallback(async () => {
    const { data, error } = await supabase
      .from("torneo_jugadores")
      .select(
        "id, jugador:jugador_id ( id, nombre_completo, categoria, genero )"
      )
      .eq("torneo_id", torneoId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error al cargar los inscriptos:", error.message);
      return null;
    }

    return (data as unknown as Inscripto[]) ?? [];
  }, [torneoId, supabase]);

  const fetchTodosLosJugadoresDesdeSupabase = useCallback(async () => {
    const { data, error } = await supabase
      .from("jugadores")
      .select("*")
      .order("nombre_completo", { ascending: true });

    if (error) {
      console.error("Error al cargar jugadores:", error.message);
      return null;
    }

    return (data as Jugador[]) ?? [];
  }, [supabase]);

  const fetchPartidosDesdeSupabase = useCallback(async () => {
    const { data, error } = await supabase
      .from("partidos")
      .select(
        "id, resultado, estado, ganador_id, fase, cancha, fecha_horario, siguiente_partido_id, jugador_1:jugador_1_id ( id, nombre_completo ), jugador_2:jugador_2_id ( id, nombre_completo )"
      )
      .eq("torneo_id", torneoId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error al cargar los partidos:", error.message);
      return null;
    }

    return (data as unknown as PartidoConJugadores[]) ?? [];
  }, [torneoId, supabase]);

  // Wrappers que sí actualizan estado: los usan los handlers (inscribir,
  // cargar resultado, generar cruces, editar/eliminar partido). Como esos
  // llamados nunca ocurren dentro de un efecto, no hay riesgo de disparar
  // la regla react-hooks/set-state-in-effect.
  const cargarInscriptos = useCallback(async () => {
    const data = await fetchInscriptosDesdeSupabase();
    if (data) setInscriptos(data);
  }, [fetchInscriptosDesdeSupabase]);

  const cargarPartidos = useCallback(async () => {
    const data = await fetchPartidosDesdeSupabase();
    if (data) setPartidos(data);
  }, [fetchPartidosDesdeSupabase]);

  const cargarTorneo = useCallback(async () => {
    const data = await fetchTorneoDesdeSupabase();
    if (data) setTorneo(data);
  }, [fetchTorneoDesdeSupabase]);

  // Carga inicial: los 4 fetches en paralelo. El setState se escribe
  // directamente acá adentro (después del await, dentro del propio cuerpo
  // del efecto) en vez de delegarlo a una función aparte, para que el
  // linter pueda verificar que no es una llamada síncrona. `ignore` evita
  // pisar el estado si el componente se desmonta antes de que resuelva.
  useEffect(() => {
    let ignore = false;

    Promise.all([
      fetchTorneoDesdeSupabase(),
      fetchInscriptosDesdeSupabase(),
      fetchTodosLosJugadoresDesdeSupabase(),
      fetchPartidosDesdeSupabase(),
    ]).then(([torneoData, inscriptosData, jugadoresData, partidosData]) => {
      if (ignore) return;

      setTorneo(torneoData);
      setIsLoadingTorneo(false);

      if (inscriptosData) setInscriptos(inscriptosData);
      setIsLoadingInscriptos(false);

      if (jugadoresData) setTodosLosJugadores(jugadoresData);

      if (partidosData) setPartidos(partidosData);
      setIsLoadingPartidos(false);
    });

    return () => {
      ignore = true;
    };
  }, [
    fetchTorneoDesdeSupabase,
    fetchInscriptosDesdeSupabase,
    fetchTodosLosJugadoresDesdeSupabase,
    fetchPartidosDesdeSupabase,
  ]);

  // Se ofrece para inscribir cualquier jugador de la base, sin importar su
  // categoría nominal: Stefano necesita poder fusionar categorías (ej. subir
  // jugadores de 5ta a un cuadro de 4ta) según la realidad del club. Lo
  // único que se excluye son los jugadores que ya están inscriptos acá.
  const jugadoresDisponibles = useMemo(() => {
    const idsInscriptos = new Set(inscriptos.map((i) => i.jugador.id));
    return todosLosJugadores.filter(
      (jugador) => !idsInscriptos.has(jugador.id)
    );
  }, [todosLosJugadores, inscriptos]);

  // Solo cuentan los sets donde se cargaron los games de ambos jugadores.
  const setsValidos = useMemo(
    () => setsResultado.filter((set) => set.j1 !== "" && set.j2 !== ""),
    [setsResultado]
  );

  // Formatea los sets cargados al texto estándar que se guarda en
  // "resultado" (ej. "6-4, 3-6, 10-7"), sin que el usuario escriba nada.
  const resultadoTexto = useMemo(
    () => setsValidos.map((set) => `${set.j1}-${set.j2}`).join(", "),
    [setsValidos]
  );

  const setsGanadosJugador1 = setsValidos.filter(
    (set) => Number(set.j1) > Number(set.j2)
  ).length;
  const setsGanadosJugador2 = setsValidos.filter(
    (set) => Number(set.j2) > Number(set.j1)
  ).length;

  // Ganador calculado a partir de la mayoría de sets. Devuelve null si
  // todavía no hay sets cargados o si están empatados (caso raro, pero
  // posible mientras se está cargando el resultado).
  const ganadorAutomaticoId = useMemo(() => {
    if (!partidoCargandoResultado || setsValidos.length === 0) return null;
    if (setsGanadosJugador1 === setsGanadosJugador2) return null;
    return setsGanadosJugador1 > setsGanadosJugador2
      ? (partidoCargandoResultado.jugador_1?.id ?? null)
      : (partidoCargandoResultado.jugador_2?.id ?? null);
  }, [
    partidoCargandoResultado,
    setsValidos.length,
    setsGanadosJugador1,
    setsGanadosJugador2,
  ]);

  // Ganador que se muestra y se guarda: el que el usuario eligió a mano
  // tiene prioridad; si no tocó nada, se usa el calculado automáticamente
  // a partir de los sets. Al ser un valor derivado (no un estado propio
  // sincronizado con un efecto), se recalcula solo en cada render sin
  // necesidad de useEffect.
  const ganadorId = ganadorManualId ?? ganadorAutomaticoId;

  const puedeGuardarResultado = setsValidos.length >= 2 && Boolean(ganadorId);

  // Estado visual del torneo (contempla el cierre automático de
  // inscripción). Se usa "inscripcion" como valor por defecto mientras el
  // torneo todavía no cargó; en la práctica solo se lee más abajo dentro
  // del bloque donde `torneo` ya está garantizado no-nulo.
  const estadoVisual = torneo ? calcularEstadoVisual(torneo) : "inscripcion";

  function handleCambiarSet(
    index: number,
    jugador: "j1" | "j2",
    valor: string
  ) {
    setSetsResultado((prev) =>
      prev.map((set, i) => (i === index ? { ...set, [jugador]: valor } : set))
    );
    // Cualquier cambio en el marcador invalida la corrección manual previa:
    // el ganador vuelve a calcularse solo a partir de los sets, tal como
    // pide el flujo (el usuario debe volver a tocar un jugador si quiere
    // forzarlo de nuevo).
    setGanadorManualId(null);
  }

  function cerrarModalInscribir() {
    setIsModalInscribirOpen(false);
  }

  async function handleInscribirJugador(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const jugadorId = formData.get("jugador_id")?.toString();

    if (!jugadorId) return;

    const { error } = await supabase.from("torneo_jugadores").insert({
      torneo_id: torneoId,
      jugador_id: jugadorId,
    });

    if (error) {
      console.error("Error al inscribir jugador:", error.message);
      return;
    }

    form.reset();
    cerrarModalInscribir();
    await cargarInscriptos();
  }

  async function handleQuitarInscripto(inscripto: Inscripto) {
    const confirmado = window.confirm(
      `¿Seguro que querés quitar a ${inscripto.jugador.nombre_completo} de este torneo?`
    );
    if (!confirmado) return;

    const { error } = await supabase
      .from("torneo_jugadores")
      .delete()
      .eq("id", inscripto.id);

    if (error) {
      console.error("Error al quitar inscripto:", error.message);
      return;
    }

    await cargarInscriptos();
  }

  function parsearResultadoASets(resultado: string | null): SetScore[] {
    const sets = SETS_VACIOS.map((set) => ({ ...set }));
    if (!resultado) return sets;

    const partes = resultado.split(",").map((parte) => parte.trim());
    for (let i = 0; i < Math.min(partes.length, sets.length); i += 1) {
      const [j1, j2] = partes[i].split("-").map((valor) => valor.trim());
      if (j1 !== undefined && j2 !== undefined) {
        sets[i] = { j1, j2 };
      }
    }
    return sets;
  }

  function abrirModalResultado(partido: PartidoConJugadores) {
    setSetsResultado(parsearResultadoASets(partido.resultado));
    setGanadorManualId(partido.ganador_id);
    setPartidoCargandoResultado(partido);
  }

  function cerrarModalResultado() {
    setPartidoCargandoResultado(null);
    setSetsResultado(SETS_VACIOS);
    setGanadorManualId(null);
  }

  async function handleGuardarResultado(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!partidoCargandoResultado || !puedeGuardarResultado || !ganadorId) {
      return;
    }

    const partidoActual = partidoCargandoResultado;

    try {
      // Update + propagación al siguiente (con candado si cambia el ganador).
      await actualizarResultadoPartidoConPropagacion({
        partido_id: partidoActual.id,
        resultado: resultadoTexto,
        ganador_id: ganadorId,
      });
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "No se pudo guardar el resultado.";
      console.error("Error al guardar/propagar resultado:", mensaje);
      toast.error(mensaje);
      return;
    }

    // Si este partido era la Final, el ganador es el campeón: cerramos el
    // torneo. El ranking ya suma +10 (Bonus Campeón) al leer partidos de
    // fase "Final" finalizados; acá solo marcamos el torneo como terminado.
    if (partidoActual.fase === "Final") {
      const hoy = new Date().toISOString().slice(0, 10);
      const { error: errorTorneo } = await supabase
        .from("torneos")
        .update({
          estado: "finalizado",
          fecha_fin: hoy,
        })
        .eq("id", torneoId);

      if (errorTorneo) {
        console.error(
          "Error al finalizar el torneo tras la Final:",
          errorTorneo.message
        );
      } else {
        await cargarTorneo();
      }
    }

    toast.success("Resultado guardado.");
    cerrarModalResultado();
    await cargarPartidos();
  }

  // Delega el armado al motor (ranking + extremos + candado anti-duplicados).
  async function handleGenerarCruces() {
    if (inscriptos.length < 2) return;

    const idsInscriptos = new Set(inscriptos.map((i) => i.jugador.id));
    const jugadores = todosLosJugadores.filter((jugador) =>
      idsInscriptos.has(jugador.id)
    );

    setIsGenerandoCruces(true);
    try {
      const resultado = await generarCrucesClasificacion(torneoId, jugadores);

      if (resultado.ok) {
        toast.success(
          `Se generaron ${resultado.partidosCreados} cruces de clasificación.`
        );
        await cargarPartidos();
        router.refresh();
      }
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "No se pudieron generar los cruces.";
      toast.error(mensaje);
    } finally {
      setIsGenerandoCruces(false);
    }
  }

  async function handleGenerarCuadroFinal() {
    setIsGenerandoCuadro(true);
    try {
      const resultado = await generarCuadroFinal(torneoId);

      if (resultado.ok) {
        toast.success(
          `Cuadro final generado: ${resultado.partidosCreados} partidos (Octavos → Final).`
        );
        await cargarPartidos();
        router.refresh();
      }
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "No se pudo generar el cuadro final.";
      toast.error(mensaje);
    } finally {
      setIsGenerandoCuadro(false);
    }
  }

  async function handleEliminarPartido(partido: PartidoConJugadores) {
    const confirmado = window.confirm(
      `¿Seguro que querés eliminar el partido "${partido.jugador_1?.nombre_completo ?? "?"} vs ${partido.jugador_2?.nombre_completo ?? "?"}"?`
    );
    if (!confirmado) return;

    const { error } = await supabase
      .from("partidos")
      .delete()
      .eq("id", partido.id);

    if (error) {
      console.error("Error al eliminar el partido:", error.message);
      return;
    }

    await cargarPartidos();
  }

  function abrirModalEditarPartido(partido: PartidoConJugadores) {
    setPartidoEditando(partido);
  }

  function cerrarModalEditarPartido() {
    setPartidoEditando(null);
  }

  async function handleGuardarEdicionPartido(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!partidoEditando) return;

    const formData = new FormData(event.currentTarget);
    const jugador1Id = formData.get("jugador_1_id")?.toString();
    const jugador2Id = formData.get("jugador_2_id")?.toString();
    const fase = formData.get("fase")?.toString();
    const cancha = formData.get("cancha")?.toString() || null;
    const fechaHorario = fromDatetimeLocalValue(
      formData.get("fecha_horario")?.toString() ?? ""
    );

    if (!jugador1Id || !jugador2Id || !fase) return;
    if (jugador1Id === jugador2Id) {
      window.alert("Jugador 1 y Jugador 2 no pueden ser el mismo jugador.");
      return;
    }

    // Solo invalidamos el resultado si de verdad cambió algún jugador. Si el
    // organizador únicamente está corrigiendo la fase, la cancha o el
    // horario (ej. pasar un partido ya jugado a "Final"), el resultado y el
    // ganador cargados se mantienen intactos.
    const cambiaronJugadores =
      jugador1Id !== partidoEditando.jugador_1?.id ||
      jugador2Id !== partidoEditando.jugador_2?.id;

    const { error } = await supabase
      .from("partidos")
      .update({
        jugador_1_id: jugador1Id,
        jugador_2_id: jugador2Id,
        fase,
        cancha,
        fecha_horario: fechaHorario,
        ...(cambiaronJugadores
          ? {
              // Si se cambia el emparejamiento, cualquier resultado cargado
              // antes queda obsoleto: volvemos el partido a "Pendiente".
              estado: "Pendiente" as EstadoPartido,
              ganador_id: null,
              resultado: null,
            }
          : {}),
      })
      .eq("id", partidoEditando.id);

    if (error) {
      console.error("Error al editar el partido:", error.message);
      return;
    }

    cerrarModalEditarPartido();
    await cargarPartidos();
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/torneos"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/60 transition hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Volver a Torneos
        </Link>

        {isLoadingTorneo ? (
          <p className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
            Cargando...
          </p>
        ) : !torneo ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
              <Trophy size={22} className="text-accent" />
            </div>
            <p className="text-sm text-foreground/60">
              No encontramos este torneo. Puede haber sido eliminado.
            </p>
          </div>
        ) : (
          <>
            {/* Cabecera del torneo */}
            <header className="mb-8 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {torneo.nombre}
                </h1>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${ESTADO_BADGE_STYLES[estadoVisual]}`}
                >
                  {ESTADO_LABELS[estadoVisual]}
                </span>
              </div>
              <p className="text-sm text-foreground/60">
                Desde {formatFecha(torneo.fecha_inicio)}
                {torneo.fecha_fin
                  ? ` — ${formatFecha(torneo.fecha_fin)}`
                  : ""}
              </p>
              {(torneo.fecha_apertura_inscripcion ||
                torneo.fecha_cierre_inscripcion) && (
                <p className="text-xs text-foreground/40">
                  Inscripción
                  {torneo.fecha_apertura_inscripcion &&
                    `: desde ${formatFecha(torneo.fecha_apertura_inscripcion)}`}
                  {torneo.fecha_cierre_inscripcion &&
                    ` hasta ${formatFechaHorario(torneo.fecha_cierre_inscripcion)}`}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {torneo.categorias.map((categoria) => (
                  <span
                    key={categoria}
                    className="inline-block rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground/80"
                  >
                    {categoria}
                  </span>
                ))}
              </div>
            </header>

            {/* Inscriptos */}
            <section className="mb-8">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                  Jugadores inscriptos
                  <span className="ml-2 text-sm font-normal text-foreground/50">
                    ({inscriptos.length})
                  </span>
                </h2>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsModalInscribirOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98]"
                  >
                    <UserPlus size={16} />
                    Inscribir Jugador
                  </button>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                {isLoadingInscriptos ? (
                  <p className="px-6 py-10 text-center text-sm text-foreground/50">
                    Cargando...
                  </p>
                ) : inscriptos.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm text-foreground/50">
                    Todavía no hay jugadores inscriptos en este torneo.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
                          <th className="px-4 py-3 font-medium sm:px-6">
                            Nombre
                          </th>
                          <th className="px-4 py-3 font-medium sm:px-6">
                            Categoría
                          </th>
                          <th className="px-4 py-3 font-medium sm:px-6">
                            Género
                          </th>
                          {isAdmin && (
                            <th className="px-4 py-3 text-right font-medium sm:px-6">
                              Acciones
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {inscriptos.map((inscripto) => (
                          <tr
                            key={inscripto.id}
                            className="border-b border-border last:border-0 hover:bg-background/40"
                          >
                            <td className="px-4 py-3 font-medium text-foreground sm:px-6">
                              {inscripto.jugador.nombre_completo}
                            </td>
                            <td className="px-4 py-3 sm:px-6">
                              <span className="inline-block rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground/80">
                                {inscripto.jugador.categoria}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-foreground/70 sm:px-6">
                              {inscripto.jugador.genero}
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-3 sm:px-6">
                                <div className="flex items-center justify-end">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuitarInscripto(inscripto)
                                    }
                                    aria-label={`Quitar a ${inscripto.jugador.nombre_completo}`}
                                    className="inline-flex items-center justify-center rounded-lg p-2 text-red-500/70 transition hover:bg-red-500/10 hover:text-red-500"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/* Partidos / Llaves */}
            <section>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  Partidos / Llaves
                </h2>

                {isAdmin && !isLoadingPartidos && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {!partidos.some((p) => p.fase === "Clasificacion") && (
                      <button
                        type="button"
                        onClick={handleGenerarCruces}
                        disabled={isGenerandoCruces || inscriptos.length < 2}
                        title={
                          inscriptos.length < 2
                            ? "Necesitás al menos 2 jugadores inscriptos"
                            : undefined
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Shuffle size={16} />
                        {isGenerandoCruces
                          ? "Generando..."
                          : "Generar Cruces Automáticos"}
                      </button>
                    )}

                    {partidos.some((p) => p.fase === "Clasificacion") &&
                      !partidos.some(
                        (p) =>
                          p.fase === "Octavos de Final" ||
                          p.fase === "Cuartos de Final" ||
                          p.fase === "Semifinal" ||
                          p.fase === "Final"
                      ) && (
                        <button
                          type="button"
                          onClick={handleGenerarCuadroFinal}
                          disabled={isGenerandoCuadro}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trophy size={16} />
                          {isGenerandoCuadro
                            ? "Generando cuadro..."
                            : "Generar Cuadro Final"}
                        </button>
                      )}
                  </div>
                )}
              </div>

              {!isLoadingPartidos && hayCuadroEliminatorio(partidos) && (
                <div className="mb-6">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/50">
                    Cuadro eliminatorio
                  </h3>
                  <CuadroTorneo partidos={partidos} />
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                {isLoadingPartidos ? (
                  <p className="px-6 py-10 text-center text-sm text-foreground/50">
                    Cargando...
                  </p>
                ) : partidos.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm text-foreground/50">
                    Todavía no se generaron partidos para este torneo.
                  </p>
                ) : (
                  partidos.map((partido) => (
                    <div
                      key={partido.id}
                      className="flex flex-col gap-3 border-b border-border p-4 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/40">
                          {partido.fase}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span
                            className={`font-medium ${
                              partido.ganador_id === partido.jugador_1?.id
                                ? "text-accent"
                                : "text-foreground"
                            }`}
                          >
                            {partido.jugador_1?.nombre_completo ?? "A definir"}
                          </span>
                          <span className="text-xs text-foreground/40">
                            vs
                          </span>
                          <span
                            className={`font-medium ${
                              partido.ganador_id === partido.jugador_2?.id
                                ? "text-accent"
                                : "text-foreground"
                            }`}
                          >
                            {partido.jugador_2?.nombre_completo ?? "A definir"}
                          </span>
                        </div>

                        {partido.fecha_horario ? (
                          <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/50">
                            <span className="inline-flex items-center gap-1">
                              <Calendar size={12} />
                              {formatFechaHorario(partido.fecha_horario)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={12} />
                              {partido.cancha ?? "Cancha a confirmar"}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex w-fit items-center rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold text-foreground/50">
                            A confirmar
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {partido.resultado && (
                          <span className="text-sm text-foreground/60">
                            {partido.resultado}
                          </span>
                        )}
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${ESTADO_PARTIDO_BADGE_STYLES[partido.estado]}`}
                        >
                          {partido.estado}
                        </span>
                        {isAdmin &&
                          partido.estado === "Pendiente" &&
                          partido.jugador_1 &&
                          partido.jugador_2 && (
                            <button
                              type="button"
                              onClick={() => abrirModalResultado(partido)}
                              className="min-h-11 shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground/80 transition hover:bg-background hover:text-foreground"
                            >
                              Cargar Resultado
                            </button>
                          )}
                        {isAdmin && partido.estado === "Finalizado" && (
                          <button
                            type="button"
                            onClick={() => abrirModalResultado(partido)}
                            className="min-h-11 shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground/80 transition hover:bg-background hover:text-foreground"
                          >
                            Editar Resultado
                          </button>
                        )}
                        {isAdmin && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => abrirModalEditarPartido(partido)}
                              aria-label="Editar cruce"
                              className="inline-flex items-center justify-center rounded-lg p-2 text-foreground/50 transition hover:bg-foreground/10 hover:text-foreground"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEliminarPartido(partido)}
                              aria-label="Eliminar partido"
                              className="inline-flex items-center justify-center rounded-lg p-2 text-red-500/70 transition hover:bg-red-500/10 hover:text-red-500"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Modal: Inscribir Jugador */}
      {isModalInscribirOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={cerrarModalInscribir}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40 sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Inscribir Jugador
              </h2>
              <button
                type="button"
                onClick={cerrarModalInscribir}
                aria-label="Cerrar"
                className="text-foreground/50 transition hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInscribirJugador} className="space-y-5">
              <div className="space-y-1.5">
                <label
                  htmlFor="jugador_id"
                  className="block text-sm font-medium text-foreground/80"
                >
                  Jugador
                </label>
                <select
                  id="jugador_id"
                  name="jugador_id"
                  required
                  defaultValue=""
                  disabled={jugadoresDisponibles.length === 0}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
                >
                  <option value="" disabled>
                    {jugadoresDisponibles.length === 0
                      ? "No hay jugadores disponibles"
                      : "Seleccioná un jugador"}
                  </option>
                  {jugadoresDisponibles.map((jugador) => (
                    <option key={jugador.id} value={jugador.id}>
                      {jugador.nombre_completo} · {jugador.categoria}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-foreground/40">
                  Se muestran todos los jugadores registrados, sin filtrar
                  por categoría, para poder fusionar cuadros cuando haga
                  falta. Solo se ocultan los que ya están inscriptos acá.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={cerrarModalInscribir}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={jugadoresDisponibles.length === 0}
                  className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Inscribir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cargar Resultado */}
      {partidoCargandoResultado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={cerrarModalResultado}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40 sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {partidoCargandoResultado.estado === "Finalizado"
                  ? "Editar Resultado"
                  : "Cargar Resultado"}
              </h2>
              <button
                type="button"
                onClick={cerrarModalResultado}
                aria-label="Cerrar"
                className="text-foreground/50 transition hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <p className="mb-6 text-sm text-foreground/60">
              {partidoCargandoResultado.jugador_1?.nombre_completo ?? "?"} vs{" "}
              {partidoCargandoResultado.jugador_2?.nombre_completo ?? "?"}
            </p>

            <form onSubmit={handleGuardarResultado} className="space-y-5">
              <div className="space-y-2">
                <p className="block text-sm font-medium text-foreground/80">
                  Resultado por sets
                </p>

                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="grid grid-cols-[1fr_4.5rem_1.5rem_4.5rem] items-center gap-2 bg-background/60 px-3 py-2 text-xs font-medium text-foreground/40">
                    <span />
                    <span className="truncate text-center">
                      {partidoCargandoResultado.jugador_1?.nombre_completo ??
                        "Jugador 1"}
                    </span>
                    <span />
                    <span className="truncate text-center">
                      {partidoCargandoResultado.jugador_2?.nombre_completo ??
                        "Jugador 2"}
                    </span>
                  </div>

                  {setsResultado.map((set, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[1fr_4.5rem_1.5rem_4.5rem] items-center gap-2 border-t border-border px-3 py-2.5"
                    >
                      <label
                        htmlFor={`set-${index}-j1`}
                        className="text-sm text-foreground/70"
                      >
                        {index < 2
                          ? `Set ${index + 1}`
                          : "Set 3 / Super TB"}
                        {index === 2 && (
                          <span className="ml-1 text-xs text-foreground/30">
                            (opcional)
                          </span>
                        )}
                      </label>
                      <input
                        id={`set-${index}-j1`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={set.j1}
                        onChange={(event) =>
                          handleCambiarSet(index, "j1", event.target.value)
                        }
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-center text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                      />
                      <span className="text-center text-xs text-foreground/30">
                        -
                      </span>
                      <input
                        aria-label={`Set ${index + 1}, games del jugador 2`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={set.j2}
                        onChange={(event) =>
                          handleCambiarSet(index, "j2", event.target.value)
                        }
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-center text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  ))}
                </div>

                <p className="text-xs text-foreground/40">
                  {resultadoTexto
                    ? `Se va a guardar como: ${resultadoTexto}`
                    : "Cargá al menos el Set 1 y el Set 2. El Set 3 es opcional."}
                </p>
              </div>

              <div className="space-y-2">
                <p className="block text-sm font-medium text-foreground/80">
                  Ganador
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    partidoCargandoResultado.jugador_1,
                    partidoCargandoResultado.jugador_2,
                  ].map(
                    (jugador) =>
                      jugador && (
                        <button
                          key={jugador.id}
                          type="button"
                          onClick={() => setGanadorManualId(jugador.id)}
                          className={`flex items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                            ganadorId === jugador.id
                              ? "border-accent bg-accent/15 text-accent"
                              : "border-border bg-background text-foreground/60 hover:text-foreground"
                          }`}
                        >
                          {jugador.nombre_completo}
                        </button>
                      )
                  )}
                </div>
                <p className="text-xs text-foreground/40">
                  Se calcula solo según los sets ganados. Tocá un jugador
                  para corregirlo manualmente (ej. retiro a mitad de
                  partido).
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={cerrarModalResultado}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!puedeGuardarResultado}
                  className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Guardar resultado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Cruce (cambiar jugador 1 y/o jugador 2 de un partido) */}
      {partidoEditando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={cerrarModalEditarPartido}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40 sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Editar Cruce
              </h2>
              <button
                type="button"
                onClick={cerrarModalEditarPartido}
                aria-label="Cerrar"
                className="text-foreground/50 transition hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleGuardarEdicionPartido}
              className="space-y-5"
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="fase"
                  className="block text-sm font-medium text-foreground/80"
                >
                  Fase
                </label>
                <select
                  id="fase"
                  name="fase"
                  required
                  defaultValue={partidoEditando.fase}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                >
                  {FASES_PARTIDO.map((fase) => (
                    <option key={fase} value={fase}>
                      {fase}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="cancha"
                    className="block text-sm font-medium text-foreground/80"
                  >
                    Cancha
                  </label>
                  <select
                    id="cancha"
                    name="cancha"
                    defaultValue={partidoEditando.cancha ?? ""}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                  >
                    <option value="">Sin asignar</option>
                    {CANCHAS_TORNEO.map((cancha) => (
                      <option key={cancha} value={cancha}>
                        {cancha}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="fecha_horario"
                    className="block text-sm font-medium text-foreground/80"
                  >
                    Día y hora
                  </label>
                  <input
                    id="fecha_horario"
                    name="fecha_horario"
                    type="datetime-local"
                    defaultValue={toDatetimeLocalValue(
                      partidoEditando.fecha_horario
                    )}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 [color-scheme:dark]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="jugador_1_id"
                  className="block text-sm font-medium text-foreground/80"
                >
                  Jugador 1
                </label>
                <select
                  id="jugador_1_id"
                  name="jugador_1_id"
                  required
                  defaultValue={partidoEditando.jugador_1?.id ?? ""}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                >
                  {inscriptos.map((inscripto) => (
                    <option key={inscripto.jugador.id} value={inscripto.jugador.id}>
                      {inscripto.jugador.nombre_completo}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="jugador_2_id"
                  className="block text-sm font-medium text-foreground/80"
                >
                  Jugador 2
                </label>
                <select
                  id="jugador_2_id"
                  name="jugador_2_id"
                  required
                  defaultValue={partidoEditando.jugador_2?.id ?? ""}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                >
                  {inscriptos.map((inscripto) => (
                    <option key={inscripto.jugador.id} value={inscripto.jugador.id}>
                      {inscripto.jugador.nombre_completo}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-foreground/40">
                Si cambiás alguno de los jugadores, el resultado y el
                ganador cargados anteriormente se borran y el partido vuelve
                a quedar &quot;Pendiente&quot;. Cambiar solo la fase no
                afecta el resultado ya cargado.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={cerrarModalEditarPartido}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98]"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
