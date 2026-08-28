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
  construirOpcionesCuadroManual,
  generarCrucesClasificacion,
  generarCuadroFinal,
  planClasificacionPreliminar,
  type CruceDraft,
} from "@/lib/motor-torneo";
import {
  fetchPartidosTorneo,
  partidosClasificacionDe,
  partidosCuadroDe,
} from "@/lib/partidos-torneo";
import {
  CANCHAS_TORNEO,
  CATEGORIAS_JUGADOR,
  FASES_PARTIDO,
  type EstadoPartido,
  type Jugador,
  type JugadorRanking,
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
  fasePrimeraRondaDelCuadro,
  hayCuadroEliminatorio,
  idsRondasPosterioresDe,
  metadatosDesdeFaseEspejo,
  partidosDeLaPrimeraRonda,
  rondasActivasDelCuadro,
  rondaMasAvanzadaConActividad,
  RONDA_CUADRO_LABELS,
} from "@/lib/adaptar-cuadro-torneo";
import { CuadroLlaves } from "@/components/CuadroLlaves";
import { FaseClasificacionTab } from "@/components/FaseClasificacionTab";
import { HorariosTorneo } from "@/components/HorariosTorneo";
import { RankingCircuito } from "@/components/RankingCircuito";
import { ModalEditarPrimeraRonda } from "@/components/ModalEditarPrimeraRonda";
import { ModalCargarResultado } from "@/components/ModalCargarResultado";
import { RESULTADO_WALKOVER } from "@/lib/motor-ranking";
import { ModalProgramarPartido } from "@/components/ModalProgramarPartido";
import {
  categoriaDeInscripcion,
  fetchInscriptosTorneo,
  inscribirJugadoresEnTorneo,
  type InscriptoTorneo,
} from "@/lib/inscripciones-torneo";
import {
  obtenerInscripcionJugador,
  puedeInscribirse,
  textoEstadoInscripcion,
  colorEstadoInscripcion,
  type InscripcionPago,
} from "@/lib/inscripciones-pago";
import { ModalInscripcionPago } from "@/components/ModalInscripcionPago";
import { useAuth } from "@/components/auth-provider";

// Fila de "partidos" con jugador_1 / jugador_2 embebidos vía sus FKs.
interface PartidoConJugadores {
  id: string;
  resultado: string | null;
  estado: EstadoPartido;
  ganador_id: string | null;
  fase: string;
  tipo_fase?: string | null;
  ronda?: string | null;
  numero_slot?: number | null;
  categoria: string | null;
  cancha: string | null;
  fecha_programada: string | null;
  siguiente_partido_id: string | null;
  jugador_1: { id: string; nombre_completo: string } | null;
  jugador_2: { id: string; nombre_completo: string } | null;
}

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

type PestanaDetalle =
  | "ranking"
  | "horarios"
  | "jugadores"
  | "grupos"
  | "clasificacion"
  | "cuadro";

interface TorneoDetalleClientProps {
  torneoId?: string;
  ocultarVolver?: boolean;
  pestanaInicial?: PestanaDetalle;
  ranking?: JugadorRanking[];
}

export function TorneoDetalleClient({
  torneoId: torneoIdProp,
  ocultarVolver = false,
  pestanaInicial,
  ranking,
}: TorneoDetalleClientProps = {}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const torneoId = (torneoIdProp ?? params.id ?? "").toString();
  const supabase = createClient();

  const [torneo, setTorneo] = useState<Torneo | null>(null);
  const [isLoadingTorneo, setIsLoadingTorneo] = useState(true);

  const [inscriptos, setInscriptos] = useState<InscriptoTorneo[]>([]);
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

  // Estados para sistema de inscripción con pago
  const [jugadorId, setJugadorId] = useState<string | null>(null);
  const [inscripcionPago, setInscripcionPago] = useState<InscripcionPago | null>(null);
  const [modalInscripcionPagoAbierto, setModalInscripcionPagoAbierto] = useState(false);
  const [partidoProgramando, setPartidoProgramando] =
    useState<PartidoConJugadores | null>(null);
  const [partidoEditando, setPartidoEditando] =
    useState<PartidoConJugadores | null>(null);
  const [isModalEditarCuadroOpen, setIsModalEditarCuadroOpen] =
    useState(false);
  const [pestanaActiva, setPestanaActiva] = useState<PestanaDetalle>(
    pestanaInicial ?? "jugadores"
  );
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
    const { data, error } = await fetchInscriptosTorneo({ torneoId });
    if (error) return null;
    return data;
  }, [torneoId]);

  const fetchTodosLosJugadoresDesdeSupabase = useCallback(async () => {
    const { data, error } = await supabase
      .from("jugadores")
      .select("id, nombre_completo, categoria, genero")
      .order("nombre_completo", { ascending: true });

    if (error) {
      console.error("Error al cargar jugadores:", error.message);
      return [];
    }

    return ((data as Omit<Jugador, "whatsapp">[]) ?? []).map((jugador) => ({
      ...jugador,
      whatsapp: "",
    }));
  }, [supabase]);

  const fetchPartidosDesdeSupabase = useCallback(async () => {
    const { data, error } = await fetchPartidosTorneo(torneoId);
    if (error) {
      console.error("Error al cargar los partidos:", error.message);
      return null;
    }
    return data as PartidoConJugadores[];
  }, [torneoId]);

  // Wrappers que sí actualizan estado: los usan los handlers (inscribir,
  // cargar resultado, generar cruces, editar/eliminar partido). Como esos
  // llamados nunca ocurren dentro de un efecto, no hay riesgo de disparar
  // la regla react-hooks/set-state-in-effect.
  const cargarInscriptos = useCallback(async () => {
    const data = await fetchInscriptosDesdeSupabase();
    setInscriptos(data ?? []);
  }, [fetchInscriptosDesdeSupabase]);

  // Cargar jugadorId del usuario autenticado
  const cargarJugadorId = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setJugadorId(null);
      return;
    }
    
    const { data } = await supabase
      .from("jugadores")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    
    setJugadorId(data?.id ?? null);
  }, [supabase]);

  // Cargar inscripción con pago del jugador
  const cargarInscripcionPago = useCallback(async () => {
    if (!jugadorId || !torneoId) {
      setInscripcionPago(null);
      return;
    }
    
    try {
      const data = await obtenerInscripcionJugador(supabase, {
        torneoId,
        jugadorId,
      });
      setInscripcionPago(data);
    } catch (error) {
      console.error("Error al cargar inscripción:", error);
      setInscripcionPago(null);
    }
  }, [jugadorId, torneoId, supabase]);

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

    setTorneo(null);
    setInscriptos([]);
    setPartidos([]);
    setTodosLosJugadores([]);
    setCategoriaFiltro("Todas");
    setGeneroFiltro("Todos");
    setCrucesDraft([]);
    setRondaCuadroManual(null);
    setIsLoadingTorneo(true);
    setIsLoadingInscriptos(true);
    setIsLoadingPartidos(true);
    setIsLoadingJugadores(true);

    Promise.all([
      fetchTorneoDesdeSupabase(),
      fetchInscriptosDesdeSupabase(),
      fetchTodosLosJugadoresDesdeSupabase(),
      fetchPartidosDesdeSupabase(),
    ]).then(([torneoData, inscriptosData, jugadoresData, partidosData]) => {
      if (ignore) return;

      setTorneo(torneoData);
      setIsLoadingTorneo(false);

      setInscriptos(inscriptosData ?? []);
      setIsLoadingInscriptos(false);

      setTodosLosJugadores(jugadoresData ?? []);
      setIsLoadingJugadores(false);

      setPartidos(partidosData ?? []);
      setIsLoadingPartidos(false);

      if (ocultarVolver && torneoData?.categorias?.[0]) {
        setCategoriaFiltro(torneoData.categorias[0]);
      }
    });

    return () => {
      ignore = true;
    };
  }, [
    torneoId,
    ocultarVolver,
    fetchTorneoDesdeSupabase,
    fetchInscriptosDesdeSupabase,
    fetchTodosLosJugadoresDesdeSupabase,
    fetchPartidosDesdeSupabase,
  ]);

  // Cargar jugadorId del usuario autenticado
  useEffect(() => {
    void cargarJugadorId();
  }, [cargarJugadorId]);

  // Cargar inscripción con pago cuando tengamos jugadorId y torneoId
  useEffect(() => {
    void cargarInscripcionPago();
  }, [cargarInscripcionPago]);

  const cargarTodosLosJugadores = useCallback(async () => {
    setIsLoadingJugadores(true);
    const data = await fetchTodosLosJugadoresDesdeSupabase();
    setTodosLosJugadores(data);
    setIsLoadingJugadores(false);
  }, [fetchTodosLosJugadoresDesdeSupabase]);

  // Club entero. Se oculta quien ya está anotado en ESTA categoría de torneo
  // (torneo_jugadores.categoria). La ficha del club no entra en el filtro.
  const jugadoresDisponibles = useMemo(() => {
    const idsEnEstaCategoria = new Set(
      inscriptos
        .filter(
          (inscripto) =>
            Boolean(categoriaInscribir) &&
            inscripto.categoria_inscripcion === categoriaInscribir
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

  // Pills de navegación: categorías habilitadas del torneo (no la ficha del club).
  const categoriasFiltro = useMemo(() => {
    return ["Todas", ...(torneo?.categorias ?? [])];
  }, [torneo]);

  useEffect(() => {
    if (categoriaFiltro === "Todas") return;
    if (!categoriasFiltro.includes(categoriaFiltro)) {
      setCategoriaFiltro("Todas");
    }
  }, [categoriasFiltro, categoriaFiltro]);

  const inscriptosFiltrados = useMemo(() => {
    return inscriptos.filter((inscripto) => {
      const pasaGenero =
        generoFiltro === "Todos" || inscripto.jugador.genero === generoFiltro;

      if (!pasaGenero) return false;

      if (categoriaFiltro === "Todas") return true;

      // torneo_jugadores.categoria — PROHIBIDO usar inscripto.jugador.categoria
      return inscripto.categoria_inscripcion === categoriaFiltro;
    });
  }, [inscriptos, generoFiltro, categoriaFiltro]);

  const totalInscriptosEnCategoria = useMemo(() => {
    if (categoriaFiltro === "Todas") return inscriptos.length;
    return inscriptos.filter(
      (inscripto) => inscripto.categoria_inscripcion === categoriaFiltro
    ).length;
  }, [inscriptos, categoriaFiltro]);

  const partidosClasificacionFiltrados = useMemo(() => {
    if (categoriaFiltro === "Todas") return [];
    return partidosClasificacionDe(partidos, categoriaFiltro);
  }, [partidos, categoriaFiltro]);

  const idsJugadoresFiltrados = useMemo(
    () => inscriptosFiltrados.map((inscripto) => inscripto.jugador.id),
    [inscriptosFiltrados]
  );

  const partidosCuadroCategoria = useMemo(() => {
    if (categoriaFiltro === "Todas") return [];
    return partidosCuadroDe(partidos, categoriaFiltro);
  }, [partidos, categoriaFiltro]);

  const partidosHorarios = useMemo(() => {
    const conHorario = partidos.filter((partido) => partido.fecha_programada);
    const porCategoria =
      categoriaFiltro === "Todas"
        ? conHorario
        : conHorario.filter(
            (partido) =>
              (partido.categoria ?? "").trim() === categoriaFiltro
          );
    const porGenero =
      generoFiltro === "Todos"
        ? porCategoria
        : porCategoria.filter((partido) => {
            const id1 = partido.jugador_1?.id;
            const id2 = partido.jugador_2?.id;
            return (
              (id1 && idsJugadoresFiltrados.includes(id1)) ||
              (id2 && idsJugadoresFiltrados.includes(id2))
            );
          });
    return [...porGenero].sort((a, b) => {
      const ta = Date.parse(a.fecha_programada ?? "");
      const tb = Date.parse(b.fecha_programada ?? "");
      return ta - tb;
    });
  }, [partidos, categoriaFiltro, generoFiltro, idsJugadoresFiltrados]);

  const planClasificacion = planClasificacionPreliminar(
    inscriptosFiltrados.length
  );
  const clasificacionCategoriaCompleta =
    (planClasificacion.partidos === 0 &&
      partidosClasificacionFiltrados.length === 0) ||
    (partidosClasificacionFiltrados.length > 0 &&
      partidosClasificacionFiltrados.every(
        (partido) =>
          partido.estado === "Finalizado" && Boolean(partido.ganador_id)
      ));

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
  const fasePrimeraRondaCuadro = useMemo(
    () => fasePrimeraRondaDelCuadro(partidosCuadroCategoria),
    [partidosCuadroCategoria]
  );
  const partidosPrimeraRondaCuadro = useMemo(
    () => partidosDeLaPrimeraRonda(partidosCuadroCategoria),
    [partidosCuadroCategoria]
  );
  const nombrePorIdCategoria = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const inscripto of inscriptosFiltrados) {
      mapa.set(inscripto.jugador.id, inscripto.jugador.nombre_completo);
    }
    for (const partido of [
      ...partidosClasificacionFiltrados,
      ...partidosCuadroCategoria,
    ]) {
      if (partido.jugador_1) {
        mapa.set(partido.jugador_1.id, partido.jugador_1.nombre_completo);
      }
      if (partido.jugador_2) {
        mapa.set(partido.jugador_2.id, partido.jugador_2.nombre_completo);
      }
    }
    return mapa;
  }, [
    inscriptosFiltrados,
    partidosClasificacionFiltrados,
    partidosCuadroCategoria,
  ]);
  const opcionesCuadroManual = useMemo(
    () =>
      construirOpcionesCuadroManual(
        partidosClasificacionFiltrados.map((partido) => ({
          jugador_1_id: partido.jugador_1?.id ?? null,
          jugador_2_id: partido.jugador_2?.id ?? null,
          ganador_id: partido.ganador_id,
          estado: partido.estado,
        })),
        idsJugadoresFiltrados,
        nombrePorIdCategoria
      ),
    [
      partidosClasificacionFiltrados,
      idsJugadoresFiltrados,
      nombrePorIdCategoria,
    ]
  );
  const idsRondasPosterioresPrimeraRonda = useMemo(() => {
    if (!fasePrimeraRondaCuadro) return [];
    return idsRondasPosterioresDe(
      partidosCuadroCategoria,
      fasePrimeraRondaCuadro
    );
  }, [partidosCuadroCategoria, fasePrimeraRondaCuadro]);

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
    setPartidoCargandoResultado(null);
    setPartidoProgramando(null);
    setPartidoEditando(null);
  }

  // Estado visual del torneo (contempla el cierre automático de
  // inscripción). Se usa "inscripcion" como valor por defecto mientras el
  // torneo todavía no cargó; en la práctica solo se lee más abajo dentro
  // del bloque donde `torneo` ya está garantizado no-nulo.
  const estadoVisual = torneo ? calcularEstadoVisual(torneo) : "inscripcion";
  const formatoTorneo = normalizarFormatoTorneo(torneo?.formato);

  const pestanasVisibles = useMemo(() => {
    const pestanas: { id: PestanaDetalle; label: string }[] = [];
    if (ranking) {
      pestanas.push({ id: "ranking", label: "Ranking" });
    }
    pestanas.push({ id: "horarios", label: "Horarios" });
    pestanas.push({ id: "jugadores", label: "Participantes" });
    if (formatoTorneo === "grupos_eliminatoria") {
      pestanas.push({ id: "grupos", label: "Fase de Grupos" });
    }
    if (formatoTorneo === "clasificacion_eliminatoria") {
      pestanas.push({ id: "clasificacion", label: "Fase de Clasificación" });
    }
    pestanas.push({ id: "cuadro", label: "Cuadro Eliminatorio" });
    return pestanas;
  }, [formatoTorneo, ranking]);

  const pestanaMostrada = pestanasVisibles.some((p) => p.id === pestanaActiva)
    ? pestanaActiva
    : "jugadores";

  function cerrarModalInscribir() {
    setIsModalInscribirOpen(false);
    setIdsInscribir([]);
    setCategoriaInscribir("");
    setBusquedaInscribir("");
    setIsInscribiendo(false);
  }

  function abrirModalInscribir() {
    if (!isAdmin) return;
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
    if (!isAdmin) return;
    if (idsInscribir.length === 0 || !categoriaInscribir) return;

    const idsPedido = [...idsInscribir];
    const categoriaPedido = categoriaInscribir;

    setIsInscribiendo(true);
    try {
      await inscribirJugadoresEnTorneo({
        torneoId,
        jugadorIds: idsPedido,
        categoria: categoriaPedido,
      });

      const inscriptosActuales = await fetchInscriptosDesdeSupabase();
      if (!inscriptosActuales) {
        throw new Error(
          "La inscripción no se pudo confirmar: falló la recarga de participantes."
        );
      }

      const noAparecen = idsPedido.filter(
        (id) =>
          !inscriptosActuales.some(
            (inscripto) =>
              inscripto.jugador.id === id &&
              inscripto.categoria_inscripcion === categoriaPedido
          )
      );
      if (noAparecen.length > 0) {
        throw new Error(
          `La ficha no quedó en ${categoriaPedido}. El registro no se vinculó a esa categoría.`
        );
      }

      setInscriptos(inscriptosActuales);
      setCategoriaFiltro(categoriaPedido);
      router.refresh();

      toast.success(
        idsPedido.length === 1
          ? "Inscripción lista."
          : `${idsPedido.length} inscripciones listas.`
      );
      cerrarModalInscribir();
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "No se pudieron completar las inscripciones.";
      console.error("Error al inscribir:", mensaje);
      toast.error(mensaje);
    } finally {
      setIsInscribiendo(false);
    }
  }

  async function handleQuitarInscripto(inscripto: InscriptoTorneo) {
    if (!isAdmin) return;
    const confirmado = window.confirm(
      `¿Seguro que querés quitar a ${inscripto.jugador.nombre_completo} de ${inscripto.categoria_inscripcion} en este torneo?`
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

  function abrirModalResultado(partido: PartidoConJugadores) {
    if (!isAdmin) return;
    setPartidoCargandoResultado(partido);
  }

  function cerrarModalResultado() {
    setPartidoCargandoResultado(null);
  }

  async function handleGuardarResultado(payload: {
    resultado: string;
    ganador_id: string;
  }) {
    if (!isAdmin || !partidoCargandoResultado) return;

    const partidoActual = partidoCargandoResultado;

    try {
      await actualizarResultadoPartidoConPropagacion({
        partido_id: partidoActual.id,
        resultado: payload.resultado,
        ganador_id: payload.ganador_id,
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

    toast.success(
      payload.resultado === RESULTADO_WALKOVER
        ? "W.O. registrado. El ganador avanza."
        : "Resultado guardado."
    );
    cerrarModalResultado();
    await cargarPartidos();
    if (partidoActual.fase === "Clasificacion") {
      await cargarInscriptos();
    }
    router.refresh();
  }

  // Delega el armado al motor (ranking + extremos + byes / W.O.).
  async function handleGenerarCruces() {
    if (!isAdmin) return;
    const jugadores = inscriptosFiltrados.map((inscripto) => ({
      id: inscripto.jugador.id,
      nombre_completo: inscripto.jugador.nombre_completo,
      whatsapp: "",
      categoria: categoriaDeInscripcion(inscripto),
      genero: inscripto.jugador.genero,
    }));

    if (jugadores.length < 2) {
      toast.error("Seleccioná una categoría con al menos 2 personas inscriptas.");
      return;
    }

    setIsGenerandoCruces(true);
    try {
      const resultado = await generarCrucesClasificacion(
        torneoId,
        categoriaFiltro,
        jugadores
      );

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
    if (!isAdmin) return;
    if (!clasificacionCategoriaCompleta) {
      toast.error(
        "Cargá todos los resultados de clasificación de esta categoría antes de armar el cuadro."
      );
      return;
    }

    const reemplazar = hayCuadroEliminatorio(partidosCuadroCategoria);
    if (
      reemplazar &&
      !window.confirm(
        "¿Regenerar el cuadro eliminatorio? Se borrarán solo las llaves (Octavos/Cuartos/Semis/Final) de esta categoría. La clasificación y las inscripciones no se tocan."
      )
    ) {
      return;
    }

    setIsGenerandoCuadro(true);
    try {
      const resultado = await generarCuadroFinal(
        torneoId,
        categoriaFiltro,
        idsJugadoresFiltrados
      );

      if (resultado.ok) {
        const ronda = resultado.primeraFase
          ? ` desde ${resultado.primeraFase}`
          : "";
        toast.success(
          `Cuadro generado desde clasificación${ronda}: ${resultado.partidosCreados} partidos.`
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
    if (!isAdmin) return;
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
    if (!isAdmin) return;
    setPartidoEditando(partido);
  }

  function cerrarModalEditarPartido() {
    setPartidoEditando(null);
  }

  async function handleGuardarEdicionPartido(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!isAdmin || !partidoEditando) return;

    const formData = new FormData(event.currentTarget);
    const jugador1Id = formData.get("jugador_1_id")?.toString();
    const jugador2Id = formData.get("jugador_2_id")?.toString();
    const fase = formData.get("fase")?.toString();
    const cancha = formData.get("cancha")?.toString() || null;
    const fechaHorario = fromDatetimeLocalValue(
      formData.get("fecha_programada")?.toString() ?? ""
    );

    if (!jugador1Id || !jugador2Id || !fase) return;
    if (jugador1Id === jugador2Id) {
      window.alert("Los dos lados del partido no pueden ser la misma persona.");
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
        ...metadatosDesdeFaseEspejo(fase),
        cancha,
        fecha_programada: fechaHorario,
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
    <main className={`bg-background px-4 sm:px-6 lg:px-10 ${ocultarVolver ? "pb-8 pt-4" : "py-8"}`}>
      <div className="mx-auto max-w-5xl">
        {!ocultarVolver ? (
          <Link
            href="/torneos"
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/60 transition hover:text-foreground"
          >
            <ArrowLeft size={16} />
            Volver a Torneos
          </Link>
        ) : null}

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

            {/* Sección de Inscripción con Pago */}
            {torneo && (torneo.precio_inscripcion ?? 0) > 0 && jugadorId && !isAdmin ? (
              <section className="mb-6 rounded-2xl border border-border bg-surface p-5 sm:p-6">
                <h3 className="mb-3 text-base font-semibold text-foreground">
                  Inscripción al Torneo
                </h3>
                
                {inscripcionPago ? (
                  // Ya tiene una inscripción
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                        colorEstadoInscripcion(inscripcionPago.estado_pago).border
                      } ${colorEstadoInscripcion(inscripcionPago.estado_pago).bg} ${
                        colorEstadoInscripcion(inscripcionPago.estado_pago).text
                      }`}
                    >
                      {textoEstadoInscripcion(inscripcionPago.estado_pago)}
                    </div>
                    {inscripcionPago.estado_pago === "pendiente" ? (
                      <p className="text-sm text-foreground/60">
                        El administrador verificará tu pago en breve.
                      </p>
                    ) : null}
                  </div>
                ) : puedeInscribirse(inscripcionPago).puede ? (
                  // Puede inscribirse
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-foreground/70">
                        Precio de inscripción:{" "}
                        <span className="font-semibold text-foreground">
                          ${(torneo.precio_inscripcion ?? 0).toFixed(2)}
                        </span>
                      </p>
                      {torneo.datos_pago_texto ? (
                        <p className="mt-1 text-xs text-foreground/50">
                          Hacé clic en "Inscribirme" para ver los datos de pago.
                        </p>
                      ) : null}
                    </div>
                    <button
                      onClick={() => setModalInscripcionPagoAbierto(true)}
                      className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
                    >
                      Inscribirme al Torneo
                    </button>
                  </div>
                ) : (
                  // No puede inscribirse (con razón)
                  <p className="text-sm text-foreground/60">
                    {puedeInscribirse(inscripcionPago).razon}
                  </p>
                )}
              </section>
            ) : null}

            {pestanaMostrada !== "ranking" ? (
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
                {categoriasFiltro.map((categoria) => {
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
            ) : null}

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

            {pestanaMostrada === "ranking" && ranking ? (
              <RankingCircuito ranking={ranking} compacto />
            ) : null}

            {pestanaMostrada === "horarios" ? (
              <HorariosTorneo
                partidos={partidosHorarios}
                isLoading={isLoadingPartidos}
              />
            ) : null}

            {/* Pestaña: Jugadores Inscriptos */}
            {pestanaMostrada === "jugadores" && (
            <section key={`inscriptos-${generoFiltro}-${categoriaFiltro}`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                  Participantes
                  <span className="ml-2 text-sm font-normal text-foreground/50">
                    ({inscriptosFiltrados.length}
                    {generoFiltro !== "Todos" || categoriaFiltro !== "Todas"
                      ? ` de ${totalInscriptosEnCategoria}`
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
                    Inscribir
                  </button>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                {isLoadingInscriptos ? (
                  <p className="px-6 py-10 text-center text-sm text-foreground/50">
                    Cargando...
                  </p>
                ) : inscriptosFiltrados.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm text-foreground/50">
                    {categoriaFiltro !== "Todas"
                      ? `Todavía no hay personas inscriptas en ${categoriaFiltro} de este torneo.`
                      : generoFiltro !== "Todos"
                        ? `No hay personas inscriptas (${generoFiltro}) en este torneo.`
                        : "Todavía no hay personas inscriptas en este torneo."}
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
                            Categoría del torneo
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
                                {categoriaDeInscripcion(inscripto) || "—"}
                              </span>
                              {inscripto.categoria_inscripcion !==
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
                categoriaTorneo={categoriaFiltro}
                categoriaLabel={`${categoriaFiltro}${
                  generoFiltro !== "Todos" ? ` · ${generoFiltro}` : ""
                }`}
                isAdmin={isAdmin}
                isLoadingPartidos={isLoadingPartidos}
                inscriptos={inscriptosFiltrados.map((inscripto) => ({
                  id: inscripto.jugador.id,
                  nombre_completo: inscripto.jugador.nombre_completo,
                  whatsapp: "",
                  categoria: categoriaDeInscripcion(inscripto),
                  genero: inscripto.jugador.genero,
                }))}
                partidosClasificacion={partidosClasificacionFiltrados}
                crucesDraft={crucesDraft}
                setCrucesDraft={setCrucesDraft}
                onGuardados={async () => {
                  await cargarPartidos();
                  router.refresh();
                }}
                onCargarResultado={
                  isAdmin
                    ? (partido) => {
                        const original = partidos.find((p) => p.id === partido.id);
                        if (original) abrirModalResultado(original);
                      }
                    : undefined
                }
                onProgramarPartido={
                  isAdmin
                    ? (partido) => {
                        const original = partidos.find((p) => p.id === partido.id);
                        if (original) setPartidoProgramando(original);
                      }
                    : undefined
                }
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
                    {partidosClasificacionFiltrados.length === 0 &&
                      inscriptosFiltrados.length >= 2 && (
                      <button
                        type="button"
                        onClick={handleGenerarCruces}
                        disabled={isGenerandoCruces || inscriptosFiltrados.length < 2}
                        title={
                          inscriptosFiltrados.length < 2
                            ? "Necesitás al menos 2 personas inscriptas"
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

                    {partidosClasificacionFiltrados.length > 0 && (
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
                            : hayCuadroEliminatorio(partidosCuadroCategoria)
                              ? "Regenerar Cuadro desde Clasificación"
                              : "Generar Cuadro desde Clasificación"}
                        </button>
                      )}

                    {hayCuadroEliminatorio(partidosCuadroCategoria) && (
                      <button
                        type="button"
                        onClick={() => setIsModalEditarCuadroOpen(true)}
                        disabled={partidosPrimeraRondaCuadro.length === 0}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background hover:text-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Pencil size={16} />
                        Editar Cuadro
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
                <div className="rounded-2xl border border-[#3f3f46] bg-[#1a1a1a] px-6 py-16 text-center">
                  <p className="text-sm text-white/50">
                    Todavía no se generó el cuadro eliminatorio para esta
                    categoría.
                  </p>
                  {isAdmin &&
                  partidosClasificacionFiltrados.length > 0 &&
                  clasificacionCategoriaCompleta ? (
                    <button
                      type="button"
                      onClick={handleGenerarCuadroFinal}
                      disabled={isGenerandoCuadro}
                      className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trophy size={18} />
                      {isGenerandoCuadro
                        ? "Generando cuadro..."
                        : "Generar Cuadro desde Clasificación"}
                    </button>
                  ) : isAdmin &&
                    partidosClasificacionFiltrados.length > 0 &&
                    !clasificacionCategoriaCompleta ? (
                    <p className="mt-4 text-xs text-white/35">
                      Cargá todos los resultados de clasificación para habilitar
                      la generación automática.
                    </p>
                  ) : null}
                </div>
              ) : (
                <CuadroLlaves
                  partidos={partidosCuadroCategoria}
                  rondaResaltada={rondaCuadroActiva}
                  isAdmin={isAdmin}
                  onCargarResultado={
                    isAdmin
                      ? (card) => {
                          const original = partidos.find(
                            (partido) => partido.id === card.id
                          );
                          if (original) abrirModalResultado(original);
                        }
                      : undefined
                  }
                  onProgramarPartido={
                    isAdmin
                      ? (card) => {
                          const original = partidos.find(
                            (partido) => partido.id === card.id
                          );
                          if (original) setPartidoProgramando(original);
                        }
                      : undefined
                  }
                />
              )}
            </section>
            ))}
          </>
        )}
      </div>

      {isAdmin && isModalEditarCuadroOpen && fasePrimeraRondaCuadro && (
        <ModalEditarPrimeraRonda
          key={`${fasePrimeraRondaCuadro}-${partidosPrimeraRondaCuadro.map((partido) => partido.id).join("-")}`}
          fase={
            RONDA_CUADRO_LABELS[fasePrimeraRondaCuadro] ??
            fasePrimeraRondaCuadro
          }
          partidos={partidosPrimeraRondaCuadro}
          opciones={opcionesCuadroManual}
          idsRondasPosteriores={idsRondasPosterioresPrimeraRonda}
          onCerrar={() => setIsModalEditarCuadroOpen(false)}
          onGuardado={async () => {
            await cargarPartidos();
            router.refresh();
          }}
        />
      )}

      {/* Modal: Inscribir jugadores (múltiples) */}
      {isAdmin && isModalInscribirOpen && (
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
                Inscribir participantes
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
                  <p className="text-[11px] leading-snug text-foreground/45">
                    Una misma persona puede estar inscripta en varias categorías
                    del mismo torneo. Solo se ocultan quienes ya están en la
                    categoría elegida.
                  </p>
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
                    Cargando fichas del club...
                  </p>
                ) : jugadoresDisponibles.length === 0 ? (
                  <p className="py-8 text-center text-sm text-foreground/50">
                    No hay más fichas para inscribir en esta categoría.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-foreground/50">
                        {idsInscribir.length === 0
                          ? "Elegí uno o más nombres"
                          : idsInscribir.length === 1
                            ? "1 nombre elegido"
                            : `${idsInscribir.length} nombres elegidos`}
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

      {isAdmin && partidoProgramando && (
        <ModalProgramarPartido
          partido={partidoProgramando}
          onCerrar={() => setPartidoProgramando(null)}
          onGuardado={async () => {
            await cargarPartidos();
            router.refresh();
          }}
        />
      )}

      {isAdmin && partidoCargandoResultado && (
        <ModalCargarResultado
          partido={partidoCargandoResultado}
          onCerrar={cerrarModalResultado}
          onGuardar={handleGuardarResultado}
        />
      )}

      {/* Modal: Editar Cruce (cambiar jugador 1 y/o jugador 2 de un partido) */}
      {isAdmin && partidoEditando && (
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
                    htmlFor="fecha_programada"
                    className="block text-sm font-medium text-foreground/80"
                  >
                    Día y hora
                  </label>
                  <input
                    id="fecha_programada"
                    name="fecha_programada"
                    type="datetime-local"
                    defaultValue={toDatetimeLocalValue(
                      partidoEditando.fecha_programada
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
                  Lado 1
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
                  Lado 2
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
                Si cambiás alguno de los nombres, el resultado y quién ganó
                se borran y el partido vuelve a quedar &quot;Pendiente&quot;.
                Cambiar solo la fase no afecta el resultado ya cargado.
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

      {/* Modal de inscripción con pago */}
      {modalInscripcionPagoAbierto && jugadorId && torneo ? (
        <ModalInscripcionPago
          torneoId={torneo.id}
          torneoNombre={torneo.nombre}
          jugadorId={jugadorId}
          precioInscripcion={torneo.precio_inscripcion ?? 0}
          datosPago={torneo.datos_pago_texto ?? null}
          onClose={() => setModalInscripcionPagoAbierto(false)}
          onInscripcionCreada={() => {
            void cargarInscripcionPago();
            void cargarInscriptos();
          }}
        />
      ) : null}
    </main>
  );
}
