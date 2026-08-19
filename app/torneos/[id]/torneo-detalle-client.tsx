"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
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
  type CruceDraft,
} from "@/lib/motor-torneo";
import {
  CANCHAS_TORNEO,
  CATEGORIAS_JUGADOR,
  FASES_PARTIDO,
  type EstadoPartido,
  type Jugador,
  type Torneo,
  normalizarFormatoTorneo,
} from "@/lib/types";
import { ESTADO_BADGE_STYLES, ESTADO_LABELS, calcularEstadoVisual } from "@/lib/torneo-estado";
import {
  formatFecha,
  formatFechaHorario,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/datetime";
import {
  hayCuadroEliminatorio,
  partidosDelCuadroPorJugadores,
  rondasActivasDelCuadro,
  rondaMasAvanzadaConActividad,
  idsRondasPosterioresDe,
  RONDA_CUADRO_LABELS,
} from "@/lib/adaptar-cuadro-torneo";
import { CuadroLlaves } from "@/components/CuadroLlaves";
import { FaseClasificacionTab } from "@/components/FaseClasificacionTab";
import { ModalEditarPrimeraRonda } from "@/components/ModalEditarPrimeraRonda";
import { ModalProgramarPartido } from "@/components/ModalProgramarPartido";
import { useAuth } from "@/components/auth-provider";

// Fila de la tabla intermedia "torneo_jugadores" con los datos del jugador
// embebidos gracias a la FK jugador_id -> jugadores.id (select anidado de
// Supabase/PostgREST, sin necesidad de un join manual en el cliente).
interface Inscripto {
  id: string;
  categoria: string | null;
  jugador: {
    id: string;
    nombre_completo: string;
    categoria: string;
    genero: string;
  };
}

function categoriaDeCompetencia(inscripto: Inscripto) {
  const asignada = inscripto.categoria?.trim();
  return asignada || inscripto.jugador.categoria;
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

function EmptyStateCategoria() {
  return (
    <section className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <p className="text-base font-semibold text-foreground/70">
        Selecciona una categoría específica arriba para ver su cuadro de
        competencia
      </p>
      <p className="mt-2 max-w-sm text-sm text-foreground/40">
        Cada categoría es un torneo propio. No se pueden mezclar cuadros.
      </p>
    </section>
  );
}

type PestanaDetalle = "jugadores" | "grupos" | "clasificacion" | "cuadro";

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
  const [isLoadingJugadores, setIsLoadingJugadores] = useState(true);

  const [partidos, setPartidos] = useState<PartidoConJugadores[]>([]);
  const [isLoadingPartidos, setIsLoadingPartidos] = useState(true);
  const [isGenerandoCruces, setIsGenerandoCruces] = useState(false);
  const [isGenerandoCuadro, setIsGenerandoCuadro] = useState(false);

  const [isModalInscribirOpen, setIsModalInscribirOpen] = useState(false);
  const [idsInscribir, setIdsInscribir] = useState<string[]>([]);
  const [categoriaInscribir, setCategoriaInscribir] = useState("");
  const [busquedaInscribir, setBusquedaInscribir] = useState("");
  const [isInscribiendo, setIsInscribiendo] = useState(false);
  const [partidoCargandoResultado, setPartidoCargandoResultado] =
    useState<PartidoConJugadores | null>(null);
  const [partidoProgramando, setPartidoProgramando] =
    useState<PartidoConJugadores | null>(null);
  const [setsResultado, setSetsResultado] = useState<SetScore[]>(SETS_VACIOS);
  // Solo se setea cuando el usuario toca explícitamente un jugador para
  // corregir el ganador a mano (ej. retiro a mitad de partido). El ganador
  // "real" que se usa en pantalla y al guardar es el derivado más abajo
  // (ganadorManualId si existe, si no el calculado automáticamente).
  const [ganadorManualId, setGanadorManualId] = useState<string | null>(null);
  const [partidoEditando, setPartidoEditando] =
    useState<PartidoConJugadores | null>(null);
  const [isModalEditarCuadroOpen, setIsModalEditarCuadroOpen] =
    useState(false);
  const [pestanaActiva, setPestanaActiva] =
    useState<PestanaDetalle>("jugadores");
  const [categoriaFiltro, setCategoriaFiltro] = useState("Todas");
  const [generoFiltro, setGeneroFiltro] = useState("Todos");
  const [crucesDraft, setCrucesDraft] = useState<CruceDraft[]>([]);
  const [rondaCuadroManual, setRondaCuadroManual] = useState<string | null>(
    null
  );

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
    const consulta = () =>
      supabase
        .from("torneo_jugadores")
        .select(
          "id, categoria, jugador:jugador_id ( id, nombre_completo, categoria, genero )"
        )
        .eq("torneo_id", torneoId)
        .order("created_at", { ascending: true });

    let { data, error } = await consulta();

    if (error?.message.toLowerCase().includes("categoria")) {
      const fallback = await supabase
        .from("torneo_jugadores")
        .select(
          "id, jugador:jugador_id ( id, nombre_completo, categoria, genero )"
        )
        .eq("torneo_id", torneoId)
        .order("created_at", { ascending: true });
      data = (fallback.data ?? []).map((fila) => ({
        ...fila,
        categoria: null,
      }));
      error = fallback.error;
    }

    if (error) {
      console.error("Error al cargar los inscriptos:", error.message);
      return null;
    }

    return (data as unknown as Inscripto[]) ?? [];
  }, [torneoId, supabase]);

  const fetchTodosLosJugadoresDesdeSupabase = useCallback(async () => {
    const { data, error } = await supabase
      .from("jugadores")
      .select("id, nombre_completo, whatsapp, categoria, genero")
      .order("nombre_completo", { ascending: true });

    if (error) {
      console.error("Error al cargar jugadores:", error.message);
      return [];
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

      setTodosLosJugadores(jugadoresData ?? []);
      setIsLoadingJugadores(false);

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

  const cargarTodosLosJugadores = useCallback(async () => {
    setIsLoadingJugadores(true);
    const data = await fetchTodosLosJugadoresDesdeSupabase();
    setTodosLosJugadores(data);
    setIsLoadingJugadores(false);
  }, [fetchTodosLosJugadoresDesdeSupabase]);

  // Lista del club entero. Solo se oculta quien ya compete en la categoría
  // destino; si está inscripto en otra, sigue apareciendo para cruzarlo.
  const jugadoresDisponibles = useMemo(() => {
    const idsEnEstaCategoria = new Set(
      inscriptos
        .filter(
          (inscripto) =>
            Boolean(categoriaInscribir) &&
            categoriaDeCompetencia(inscripto) === categoriaInscribir
        )
        .map((inscripto) => inscripto.jugador.id)
    );
    return todosLosJugadores.filter(
      (jugador) => !idsEnEstaCategoria.has(jugador.id)
    );
  }, [todosLosJugadores, inscriptos, categoriaInscribir]);

  const jugadoresDisponiblesFiltrados = useMemo(() => {
    const q = busquedaInscribir.trim().toLowerCase();
    if (!q) return jugadoresDisponibles;
    return jugadoresDisponibles.filter((jugador) =>
      `${jugador.nombre_completo} ${jugador.categoria}`
        .toLowerCase()
        .includes(q)
    );
  }, [jugadoresDisponibles, busquedaInscribir]);

  const categoriasInscriptos = useMemo(() => {
    const base =
      generoFiltro === "Todos"
        ? inscriptos
        : inscriptos.filter(
            (inscripto) => inscripto.jugador.genero === generoFiltro
          );
    const unicas = [
      ...new Set(
        base
          .map((inscripto) => categoriaDeCompetencia(inscripto))
          .filter((categoria) => Boolean(categoria))
      ),
    ].sort((a, b) => a.localeCompare(b, "es"));
    return ["Todas", ...unicas];
  }, [inscriptos, generoFiltro]);

  const inscriptosFiltrados = useMemo(() => {
    return inscriptos.filter((inscripto) => {
      const pasaGenero =
        generoFiltro === "Todos" || inscripto.jugador.genero === generoFiltro;
      const pasaCategoria =
        categoriaFiltro === "Todas" ||
        categoriaDeCompetencia(inscripto) === categoriaFiltro;
      return pasaGenero && pasaCategoria;
    });
  }, [inscriptos, generoFiltro, categoriaFiltro]);

  const partidosClasificacionFiltrados = useMemo(() => {
    const ids = new Set(
      inscriptosFiltrados.map((inscripto) => inscripto.jugador.id)
    );
    return partidos.filter((partido) => {
      if (partido.fase !== "Clasificacion") return false;
      const j1 = partido.jugador_1?.id;
      const j2 = partido.jugador_2?.id;
      return Boolean((j1 && ids.has(j1)) || (j2 && ids.has(j2)));
    });
  }, [partidos, inscriptosFiltrados]);

  const idsJugadoresFiltrados = useMemo(
    () => inscriptosFiltrados.map((inscripto) => inscripto.jugador.id),
    [inscriptosFiltrados]
  );

  const partidosCuadroCategoria = useMemo(
    () => partidosDelCuadroPorJugadores(partidos, idsJugadoresFiltrados),
    [partidos, idsJugadoresFiltrados]
  );

  const clasificacionCategoriaCompleta =
    partidosClasificacionFiltrados.length > 0 &&
    partidosClasificacionFiltrados.every(
      (partido) =>
        partido.estado === "Finalizado" && Boolean(partido.ganador_id)
    );

  const rondasCuadroDisponibles = useMemo(
    () => rondasActivasDelCuadro(partidosCuadroCategoria),
    [partidosCuadroCategoria]
  );
  const rondaCuadroSugerida = useMemo(
    () => rondaMasAvanzadaConActividad(partidosCuadroCategoria),
    [partidosCuadroCategoria]
  );
  const rondaCuadroActiva =
    rondaCuadroManual &&
    rondasCuadroDisponibles.some((fase) => fase === rondaCuadroManual)
      ? rondaCuadroManual
      : rondaCuadroSugerida;
  const partidosDeRondaActiva = useMemo(() => {
    if (!rondaCuadroActiva) return [];
    return partidosCuadroCategoria.filter(
      (partido) => partido.fase === rondaCuadroActiva
    );
  }, [partidosCuadroCategoria, rondaCuadroActiva]);
  const jugadoresElegiblesCuadro = useMemo(() => {
    const porId = new Map<string, { id: string; nombre_completo: string }>();
    for (const inscripto of inscriptosFiltrados) {
      porId.set(inscripto.jugador.id, {
        id: inscripto.jugador.id,
        nombre_completo: inscripto.jugador.nombre_completo,
      });
    }
    for (const partido of [
      ...partidosClasificacionFiltrados,
      ...partidosDeRondaActiva,
    ]) {
      if (partido.jugador_1) {
        porId.set(partido.jugador_1.id, {
          id: partido.jugador_1.id,
          nombre_completo: partido.jugador_1.nombre_completo,
        });
      }
      if (partido.jugador_2) {
        porId.set(partido.jugador_2.id, {
          id: partido.jugador_2.id,
          nombre_completo: partido.jugador_2.nombre_completo,
        });
      }
    }
    return [...porId.values()];
  }, [
    inscriptosFiltrados,
    partidosClasificacionFiltrados,
    partidosDeRondaActiva,
  ]);

  const idsRondasPosterioresCuadro = useMemo(() => {
    if (!rondaCuadroActiva) return [];
    return idsRondasPosterioresDe(partidosCuadroCategoria, rondaCuadroActiva);
  }, [partidosCuadroCategoria, rondaCuadroActiva]);

  const hayCrucesSinGuardar =
    crucesDraft.length > 0 && partidosClasificacionFiltrados.length === 0;

  const hayCrucesSinGuardarRef = useRef(hayCrucesSinGuardar);
  hayCrucesSinGuardarRef.current = hayCrucesSinGuardar;

  useEffect(() => {
    if (!hayCrucesSinGuardar) return;

    const mensaje =
      "Tienes cruces sin guardar. ¿Seguro que quieres salir?";

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = mensaje;
    }

    function onDocumentClick(event: MouseEvent) {
      if (!hayCrucesSinGuardarRef.current) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const ancla = (event.target as Element | null)?.closest("a[href]");
      if (!ancla) return;
      const anchor = ancla as HTMLAnchorElement;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      const destino = new URL(anchor.href, window.location.href);
      const actual = new URL(window.location.href);
      if (
        destino.pathname === actual.pathname &&
        destino.search === actual.search
      ) {
        return;
      }
      if (!window.confirm(mensaje)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }

    function onPopState() {
      if (!hayCrucesSinGuardarRef.current) return;
      if (!window.confirm(mensaje)) {
        window.history.pushState(null, "", window.location.href);
      }
    }

    window.history.pushState(null, "", window.location.href);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [hayCrucesSinGuardar]);

  function handleCambiarGeneroFiltro(genero: string) {
    if (genero === generoFiltro) return;
    setGeneroFiltro(genero);
    setCategoriaFiltro("Todas");
    setCrucesDraft([]);
    setRondaCuadroManual(null);
  }

  function handleCambiarCategoriaFiltro(categoria: string) {
    if (categoria === categoriaFiltro) return;
    setCategoriaFiltro(categoria);
    setCrucesDraft([]);
    setRondaCuadroManual(null);
  }

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
  const formatoTorneo = normalizarFormatoTorneo(torneo?.formato);

  const pestanasVisibles = useMemo(() => {
    const pestanas: { id: PestanaDetalle; label: string }[] = [
      { id: "jugadores", label: "Jugadores Inscriptos" },
    ];
    if (formatoTorneo === "grupos_eliminatoria") {
      pestanas.push({ id: "grupos", label: "Fase de Grupos" });
    }
    if (formatoTorneo === "clasificacion_eliminatoria") {
      pestanas.push({ id: "clasificacion", label: "Fase de Clasificación" });
    }
    pestanas.push({ id: "cuadro", label: "Cuadro Eliminatorio" });
    return pestanas;
  }, [formatoTorneo]);

  const pestanaMostrada = pestanasVisibles.some((p) => p.id === pestanaActiva)
    ? pestanaActiva
    : "jugadores";

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
    setIdsInscribir([]);
    setCategoriaInscribir("");
    setBusquedaInscribir("");
    setIsInscribiendo(false);
  }

  function abrirModalInscribir() {
    setCategoriaInscribir(
      categoriaFiltro !== "Todas" ? categoriaFiltro : ""
    );
    setIsModalInscribirOpen(true);
    void cargarTodosLosJugadores();
  }

  function toggleJugadorInscribir(jugadorId: string) {
    setIdsInscribir((prev) =>
      prev.includes(jugadorId)
        ? prev.filter((id) => id !== jugadorId)
        : [...prev, jugadorId]
    );
  }

  function toggleTodosVisiblesInscribir() {
    const idsVisibles = jugadoresDisponiblesFiltrados.map((j) => j.id);
    const todosMarcados = idsVisibles.every((id) => idsInscribir.includes(id));
    if (todosMarcados) {
      setIdsInscribir((prev) => prev.filter((id) => !idsVisibles.includes(id)));
      return;
    }
    setIdsInscribir((prev) => [...new Set([...prev, ...idsVisibles])]);
  }

  async function handleInscribirJugadores(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (idsInscribir.length === 0 || !categoriaInscribir) return;

    setIsInscribiendo(true);

    const idsYaEnTorneo = new Set(
      inscriptos.map((inscripto) => inscripto.jugador.id)
    );
    const idsNuevos = idsInscribir.filter((id) => !idsYaEnTorneo.has(id));
    const idsACruzar = idsInscribir.filter((id) => idsYaEnTorneo.has(id));

    if (idsNuevos.length > 0) {
      const { error } = await supabase.from("torneo_jugadores").insert(
        idsNuevos.map((jugador_id) => ({
          torneo_id: torneoId,
          jugador_id,
          categoria: categoriaInscribir,
        }))
      );
      if (error) {
        setIsInscribiendo(false);
        console.error("Error al inscribir jugadores:", error.message);
        toast.error(
          error.message.toLowerCase().includes("categoria")
            ? "Falta la columna categoria en inscripciones. Ejecutá el SQL de supabase/torneo-jugadores-categoria.sql."
            : "No se pudieron inscribir los jugadores."
        );
        return;
      }
    }

    if (idsACruzar.length > 0) {
      const { error } = await supabase
        .from("torneo_jugadores")
        .update({ categoria: categoriaInscribir })
        .eq("torneo_id", torneoId)
        .in("jugador_id", idsACruzar);
      if (error) {
        setIsInscribiendo(false);
        console.error("Error al cruzar jugadores de categoría:", error.message);
        toast.error("No se pudo mover al jugador a esta categoría.");
        return;
      }
    }

    setIsInscribiendo(false);

    toast.success(
      idsInscribir.length === 1
        ? "Jugador inscripto."
        : `${idsInscribir.length} jugadores inscriptos.`
    );
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

  // Delega el armado al motor (ranking + extremos + byes / W.O.).
  async function handleGenerarCruces() {
    const jugadores = inscriptosFiltrados.map((inscripto) => ({
      id: inscripto.jugador.id,
      nombre_completo: inscripto.jugador.nombre_completo,
      whatsapp: "",
      categoria: categoriaDeCompetencia(inscripto),
      genero: inscripto.jugador.genero,
    }));

    if (jugadores.length < 2) {
      toast.error("Seleccioná una categoría con al menos 2 inscriptos.");
      return;
    }

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
    if (!clasificacionCategoriaCompleta) {
      toast.error(
        "Cargá todos los resultados de clasificación de esta categoría antes de armar el cuadro."
      );
      return;
    }

    setIsGenerandoCuadro(true);
    try {
      const resultado = await generarCuadroFinal(
        torneoId,
        idsJugadoresFiltrados
      );

      if (resultado.ok) {
        const ronda = resultado.primeraFase
          ? ` desde ${resultado.primeraFase}`
          : "";
        toast.success(
          `Cuadro final generado${ronda}: ${resultado.partidosCreados} partidos.`
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

            {/* Barra de control: género + categoría mandan toda la vista */}
            <div className="mb-6 space-y-3 rounded-lg bg-[#1a1a1a] p-4">
              <div className="inline-flex rounded-lg bg-background p-1">
                {["Todos", "Masculino", "Femenino"].map((genero) => {
                  const activo = generoFiltro === genero;
                  return (
                    <button
                      key={genero}
                      type="button"
                      onClick={() => handleCambiarGeneroFiltro(genero)}
                      className={`min-h-9 rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
                        activo
                          ? "bg-surface text-foreground shadow-sm"
                          : "text-foreground/45 hover:text-foreground/70"
                      }`}
                    >
                      {genero}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {categoriasInscriptos.map((categoria) => {
                  const activa = categoriaFiltro === categoria;
                  return (
                    <button
                      key={categoria}
                      type="button"
                      onClick={() => handleCambiarCategoriaFiltro(categoria)}
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                        activa
                          ? "bg-accent text-white"
                          : "border border-border bg-surface text-foreground/55 hover:text-foreground"
                      }`}
                    >
                      {categoria}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Navegación por pestañas */}
            <nav
              className="mb-6 flex gap-1 overflow-x-auto border-b border-border"
              aria-label="Secciones del torneo"
            >
              {pestanasVisibles.map(({ id, label }) => {
                const activa = pestanaMostrada === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPestanaActiva(id)}
                    className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition ${
                      activa
                        ? "border-accent text-foreground"
                        : "border-transparent text-foreground/45 hover:text-foreground/70"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>

            {/* Pestaña: Jugadores Inscriptos */}
            {pestanaMostrada === "jugadores" && (
            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                  Jugadores inscriptos
                  <span className="ml-2 text-sm font-normal text-foreground/50">
                    ({inscriptosFiltrados.length}
                    {generoFiltro !== "Todos" || categoriaFiltro !== "Todas"
                      ? ` de ${inscriptos.length}`
                      : ""}
                    )
                  </span>
                </h2>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={abrirModalInscribir}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98]"
                  >
                    <UserPlus size={16} />
                    Inscribir jugadores
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
                ) : inscriptosFiltrados.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm text-foreground/50">
                    No hay inscriptos con esos filtros.
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
                        {inscriptosFiltrados.map((inscripto) => (
                          <tr
                            key={inscripto.id}
                            className="border-b border-border last:border-0 hover:bg-background/40"
                          >
                            <td className="px-4 py-3 font-medium text-foreground sm:px-6">
                              {inscripto.jugador.nombre_completo}
                            </td>
                            <td className="px-4 py-3 sm:px-6">
                              <span className="inline-block rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground/80">
                                {categoriaDeCompetencia(inscripto)}
                              </span>
                              {categoriaDeCompetencia(inscripto) !==
                              inscripto.jugador.categoria ? (
                                <span className="ml-2 text-[11px] text-foreground/40">
                                  ficha {inscripto.jugador.categoria}
                                </span>
                              ) : null}
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
            )}

            {/* Pestaña: Fase de Grupos */}
            {pestanaMostrada === "grupos" &&
              formatoTorneo === "grupos_eliminatoria" &&
              (categoriaFiltro === "Todas" ? (
                <EmptyStateCategoria />
              ) : (
              <section className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
                <p className="text-base font-semibold text-foreground/70">
                  Gestión de grupos (Próximamente)
                </p>
                <p className="mt-2 max-w-sm text-sm text-foreground/40">
                  Cuadro de {categoriaFiltro}
                  {generoFiltro !== "Todos" ? ` · ${generoFiltro}` : ""}.
                </p>
              </section>
            ))}

            {/* Pestaña: Fase de Clasificación */}
            {pestanaMostrada === "clasificacion" &&
              formatoTorneo === "clasificacion_eliminatoria" &&
              (categoriaFiltro === "Todas" ? (
                <EmptyStateCategoria />
              ) : (
              <FaseClasificacionTab
                key={`${generoFiltro}-${categoriaFiltro}`}
                torneoId={torneoId}
                categoriaLabel={`${categoriaFiltro}${
                  generoFiltro !== "Todos" ? ` · ${generoFiltro}` : ""
                }`}
                isAdmin={isAdmin}
                isLoadingPartidos={isLoadingPartidos}
                inscriptos={inscriptosFiltrados.map((inscripto) => ({
                  id: inscripto.jugador.id,
                  nombre_completo: inscripto.jugador.nombre_completo,
                  whatsapp: "",
                  categoria: categoriaDeCompetencia(inscripto),
                  genero: inscripto.jugador.genero,
                }))}
                partidosClasificacion={partidosClasificacionFiltrados}
                crucesDraft={crucesDraft}
                setCrucesDraft={setCrucesDraft}
                onGuardados={async () => {
                  await cargarPartidos();
                  router.refresh();
                }}
              />
            ))}

            {/* Pestaña: Cuadro Eliminatorio */}
            {pestanaMostrada === "cuadro" &&
              (categoriaFiltro === "Todas" ? (
                <EmptyStateCategoria />
              ) : (
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

                    {partidosClasificacionFiltrados.length > 0 &&
                      !hayCuadroEliminatorio(partidosCuadroCategoria) && (
                        <button
                          type="button"
                          onClick={handleGenerarCuadroFinal}
                          disabled={
                            isGenerandoCuadro || !clasificacionCategoriaCompleta
                          }
                          title={
                            !clasificacionCategoriaCompleta
                              ? "Cargá todos los resultados de clasificación primero"
                              : undefined
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trophy size={16} />
                          {isGenerandoCuadro
                            ? "Generando cuadro..."
                            : "Generar Cuadro Final"}
                        </button>
                      )}

                    {hayCuadroEliminatorio(partidosCuadroCategoria) && (
                      <button
                        type="button"
                        onClick={() => setIsModalEditarCuadroOpen(true)}
                        disabled={partidosDeRondaActiva.length === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background hover:text-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Pencil size={16} />
                        Editar Cruces Manualmente
                      </button>
                    )}
                  </div>
                )}
              </div>

              {hayCuadroEliminatorio(partidosCuadroCategoria) &&
                rondasCuadroDisponibles.length > 0 && (
                  <div
                    className="mb-6 flex flex-wrap gap-2"
                    role="tablist"
                    aria-label="Rondas del cuadro"
                  >
                    {rondasCuadroDisponibles.map((fase) => {
                      const activa = rondaCuadroActiva === fase;
                      return (
                        <button
                          key={fase}
                          type="button"
                          role="tab"
                          aria-selected={activa}
                          onClick={() => setRondaCuadroManual(fase)}
                          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                            activa
                              ? "bg-accent text-white"
                              : "border border-border bg-surface text-foreground/55 hover:text-foreground"
                          }`}
                        >
                          {RONDA_CUADRO_LABELS[fase] ?? fase}
                        </button>
                      );
                    })}
                  </div>
                )}

              {isLoadingPartidos ? (
                <div className="rounded-2xl border border-[#3f3f46] bg-[#1a1a1a] px-6 py-16 text-center text-sm text-white/50">
                  Cargando...
                </div>
              ) : !hayCuadroEliminatorio(partidosCuadroCategoria) ? (
                <div className="rounded-2xl border border-[#3f3f46] bg-[#1a1a1a] px-6 py-16 text-center text-sm text-white/50">
                  Todavía no se generó el cuadro eliminatorio para esta
                  categoría.
                </div>
              ) : (
                <CuadroLlaves
                  partidos={partidosCuadroCategoria
                    .map((ronda) =>
                      partidos.find((partido) => partido.id === ronda.id)
                    )
                    .filter((partido): partido is PartidoConJugadores =>
                      Boolean(partido)
                    )}
                  rondaResaltada={rondaCuadroActiva}
                  isAdmin={isAdmin}
                  onCargarResultado={(card) => {
                    const original = partidos.find(
                      (partido) => partido.id === card.id
                    );
                    if (original) abrirModalResultado(original);
                  }}
                  onProgramarPartido={(card) => {
                    const original = partidos.find(
                      (partido) => partido.id === card.id
                    );
                    if (original) setPartidoProgramando(original);
                  }}
                />
              )}
            </section>
            ))}
          </>
        )}
      </div>

      {isModalEditarCuadroOpen && rondaCuadroActiva && (
        <ModalEditarPrimeraRonda
          key={`${rondaCuadroActiva}-${partidosDeRondaActiva.map((partido) => partido.id).join("-")}`}
          fase={
            RONDA_CUADRO_LABELS[rondaCuadroActiva] ?? rondaCuadroActiva
          }
          partidos={partidosDeRondaActiva}
          jugadoresElegibles={jugadoresElegiblesCuadro}
          idsRondasPosteriores={idsRondasPosterioresCuadro}
          onCerrar={() => setIsModalEditarCuadroOpen(false)}
          onGuardado={async () => {
            await cargarPartidos();
            router.refresh();
          }}
        />
      )}

      {/* Modal: Inscribir jugadores (múltiples) */}
      {isModalInscribirOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={cerrarModalInscribir}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-6 pt-6 sm:px-8 sm:pt-8">
              <h2 className="text-lg font-semibold text-foreground">
                Inscribir jugadores
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

            <form
              onSubmit={handleInscribirJugadores}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5 sm:px-8">
                <div className="space-y-1.5">
                  <label
                    htmlFor="categoria-inscribir"
                    className="block text-xs font-medium text-foreground/50"
                  >
                    Inscribir en categoría
                  </label>
                  <select
                    id="categoria-inscribir"
                    required
                    value={categoriaInscribir}
                    onChange={(event) =>
                      setCategoriaInscribir(event.target.value)
                    }
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition [color-scheme:dark] focus:border-[#ea580c] focus:ring-2 focus:ring-[#ea580c]/30"
                  >
                    <option value="">Elegí una categoría</option>
                    {CATEGORIAS_JUGADOR.map((categoria) => (
                      <option key={categoria} value={categoria}>
                        {categoria}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  type="search"
                  value={busquedaInscribir}
                  onChange={(event) => setBusquedaInscribir(event.target.value)}
                  placeholder="Buscar por nombre o categoría de ficha..."
                  disabled={isLoadingJugadores}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
                />

                {isLoadingJugadores ? (
                  <p className="py-8 text-center text-sm text-foreground/50">
                    Cargando jugadores del club...
                  </p>
                ) : jugadoresDisponibles.length === 0 ? (
                  <p className="py-8 text-center text-sm text-foreground/50">
                    No hay más jugadores para inscribir en esta categoría.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-foreground/50">
                        {idsInscribir.length === 0
                          ? "Elegí uno o más jugadores"
                          : `${idsInscribir.length} seleccionado${idsInscribir.length === 1 ? "" : "s"}`}
                      </p>
                      {jugadoresDisponiblesFiltrados.length > 0 && (
                        <button
                          type="button"
                          onClick={toggleTodosVisiblesInscribir}
                          className="text-xs font-semibold text-accent hover:text-accent-hover"
                        >
                          {jugadoresDisponiblesFiltrados.every((j) =>
                            idsInscribir.includes(j.id)
                          )
                            ? "Desmarcar visibles"
                            : "Seleccionar visibles"}
                        </button>
                      )}
                    </div>

                    <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
                      {jugadoresDisponiblesFiltrados.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-foreground/50">
                          No hay coincidencias.
                        </p>
                      ) : (
                        jugadoresDisponiblesFiltrados.map((jugador) => {
                          const marcado = idsInscribir.includes(jugador.id);
                          return (
                            <label
                              key={jugador.id}
                              className={`flex min-h-11 cursor-pointer items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 transition hover:bg-background/60 ${
                                marcado ? "bg-accent/10" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={() =>
                                  toggleJugadorInscribir(jugador.id)
                                }
                                className="h-4 w-4 shrink-0 accent-[#d9682f]"
                              />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                {jugador.nombre_completo}
                              </span>
                              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground/70">
                                {jugador.categoria}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </>
                )}

                <p className="text-xs text-foreground/40">
                  Lista completa del club: podés inscribir a cualquiera en
                  esta categoría, aunque su ficha sea de otra.
                </p>
              </div>

              <div className="flex shrink-0 gap-3 border-t border-border px-6 py-4 sm:px-8">
                <button
                  type="button"
                  onClick={cerrarModalInscribir}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    idsInscribir.length === 0 ||
                    !categoriaInscribir ||
                    isInscribiendo
                  }
                  className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isInscribiendo
                    ? "Inscribiendo..."
                    : idsInscribir.length <= 1
                      ? "Inscribir"
                      : `Inscribir ${idsInscribir.length}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {partidoProgramando && (
        <ModalProgramarPartido
          partido={partidoProgramando}
          onCerrar={() => setPartidoProgramando(null)}
          onGuardado={async () => {
            await cargarPartidos();
            router.refresh();
          }}
        />
      )}

      {/* Modal: Cargar Resultado */}
      {partidoCargandoResultado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={cerrarModalResultado}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40 sm:p-8"
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
                  className="flex-1 rounded-lg bg-[#ea580c] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c2410c] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
