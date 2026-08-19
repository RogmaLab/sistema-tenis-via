"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Lock,
  MoreVertical,
  Pencil,
  Trash2,
  Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORIAS_JUGADOR,
  FORMATOS_TORNEO,
  FORMATO_TORNEO_LABELS,
  type FormatoTorneo,
  type Torneo,
  normalizarFormatoTorneo,
} from "@/lib/types";
import {
  ESTADO_BADGE_STYLES,
  ESTADO_LABELS,
  calcularEstadoVisual,
} from "@/lib/torneo-estado";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/datetime";
import { useAuth } from "@/components/auth-provider";

const MS_SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;

/** Auto-archivo visual: finalizado con fecha_fin hace más de 7 días. */
function estaArchivadoVisualmente(torneo: Torneo, ahoraMs = Date.now()) {
  if (torneo.estado !== "finalizado" || !torneo.fecha_fin) return false;
  return new Date(torneo.fecha_fin).getTime() < ahoraMs - MS_SIETE_DIAS;
}

export function TorneosClient() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const supabase = createClient();

  const [torneos, setTorneos] = useState<Torneo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [torneoEditando, setTorneoEditando] = useState<Torneo | null>(null);
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [mostrarArchivados, setMostrarArchivados] = useState(false);

  // Fetcher "puro": solo consulta Supabase y devuelve el resultado (o
  // `null` si hubo error), sin tocar ningún estado. Sirve de base tanto
  // para la carga inicial (efecto de más abajo) como para `cargarTorneos`,
  // que usan los handlers para recargar después de crear/editar/eliminar.
  const fetchTorneosDesdeSupabase = useCallback(async () => {
    const { data, error } = await supabase
      .from("torneos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error al cargar torneos:", error.message);
      return null;
    }

    return (data as Torneo[]) ?? [];
  }, [supabase]);

  // Usado por los handlers (crear/editar/eliminar): no es un efecto, así
  // que puede setear estado sin disparar react-hooks/set-state-in-effect.
  const cargarTorneos = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchTorneosDesdeSupabase();
    if (data) setTorneos(data);
    setIsLoading(false);
  }, [fetchTorneosDesdeSupabase]);

  // Carga inicial: el setState se escribe directamente acá adentro (después
  // del await, dentro del propio cuerpo del efecto) en vez de delegarlo a
  // una función aparte, para que el linter pueda verificar que no es una
  // llamada síncrona. `ignore` evita pisar el estado si el componente se
  // desmonta antes de que resuelva.
  useEffect(() => {
    let ignore = false;

    fetchTorneosDesdeSupabase().then((data) => {
      if (ignore) return;
      if (data) setTorneos(data);
      setIsLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [fetchTorneosDesdeSupabase]);

  // Cierra el menú de 3 puntitos si el usuario hace clic en cualquier otro lado.
  useEffect(() => {
    if (!menuAbiertoId) return;

    function cerrarMenu() {
      setMenuAbiertoId(null);
    }

    document.addEventListener("click", cerrarMenu);
    return () => document.removeEventListener("click", cerrarMenu);
  }, [menuAbiertoId]);

  function abrirModalNuevo() {
    setTorneoEditando(null);
    setIsModalOpen(true);
  }

  function abrirModalEdicion(torneo: Torneo) {
    setTorneoEditando(torneo);
    setIsModalOpen(true);
    setMenuAbiertoId(null);
  }

  function cerrarModal() {
    setIsModalOpen(false);
    setTorneoEditando(null);
  }

  async function handleGuardarTorneo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const nombre = formData.get("nombre")?.toString().trim();
    const fechaInicio = formData.get("fecha_inicio")?.toString();
    const fechaAperturaInscripcion =
      formData.get("fecha_apertura_inscripcion")?.toString() || null;
    const fechaCierreInscripcion = fromDatetimeLocalValue(
      formData.get("fecha_cierre_inscripcion")?.toString() ?? ""
    );
    const categorias = formData
      .getAll("categorias")
      .map((valor) => valor.toString());
    const formato = normalizarFormatoTorneo(
      formData.get("formato")?.toString()
    );

    if (!nombre || !fechaInicio) return;
    if (categorias.length === 0) return;

    if (torneoEditando) {
      const { error } = await supabase
        .from("torneos")
        .update({
          nombre,
          fecha_inicio: fechaInicio,
          fecha_apertura_inscripcion: fechaAperturaInscripcion,
          fecha_cierre_inscripcion: fechaCierreInscripcion,
          categorias,
          formato,
        })
        .eq("id", torneoEditando.id);

      if (error) {
        console.error("Error al actualizar torneo:", error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("torneos").insert({
        nombre,
        fecha_inicio: fechaInicio,
        // Sin fecha_fin: el torneo se cierra solo al coronar campeón
        // (resultado de la Final). Requiere fecha_fin nullable en Supabase.
        fecha_fin: null,
        fecha_apertura_inscripcion: fechaAperturaInscripcion,
        fecha_cierre_inscripcion: fechaCierreInscripcion,
        categorias,
        formato,
        // Un torneo recién creado siempre arranca abriendo la inscripción.
        estado: "inscripcion",
      });

      if (error) {
        console.error("Error al crear torneo:", error.message);
        return;
      }
    }

    form.reset();
    cerrarModal();
    await cargarTorneos();
  }

  async function handleEliminarTorneo(id: string) {
    setMenuAbiertoId(null);

    const confirmado = window.confirm(
      "¿Seguro que querés eliminar este torneo?"
    );
    if (!confirmado) return;

    const { error } = await supabase.from("torneos").delete().eq("id", id);

    if (error) {
      console.error("Error al eliminar torneo:", error.message);
      return;
    }

    await cargarTorneos();
  }

  // Cierra la inscripción "ya": setea fecha_cierre_inscripcion al timestamp
  // actual. calcularEstadoVisual (lib/torneo-estado.ts) lee esa fecha y
  // pasa el badge a "Torneo en curso" sin tocar la columna estado.
  async function handleCerrarInscripcionManualmente(torneo: Torneo) {
    setMenuAbiertoId(null);

    const confirmado = window.confirm(
      `¿Cerrar la inscripción de "${torneo.nombre}" ahora? El torneo pasará a "Torneo en curso".`
    );
    if (!confirmado) return;

    const { error } = await supabase
      .from("torneos")
      .update({ fecha_cierre_inscripcion: new Date().toISOString() })
      .eq("id", torneo.id);

    if (error) {
      console.error("Error al cerrar la inscripción:", error.message);
      return;
    }

    await cargarTorneos();
    router.refresh();
  }

  const { torneosVisibles, torneosArchivados } = useMemo(() => {
    const visibles: Torneo[] = [];
    const archivados: Torneo[] = [];
    for (const torneo of torneos) {
      if (estaArchivadoVisualmente(torneo)) archivados.push(torneo);
      else visibles.push(torneo);
    }
    return { torneosVisibles: visibles, torneosArchivados: archivados };
  }, [torneos]);

  const listaActual = mostrarArchivados ? torneosArchivados : torneosVisibles;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Encabezado */}
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {mostrarArchivados
                ? "Historial de torneos archivados"
                : "Gestión de Torneos"}
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              {mostrarArchivados
                ? `${torneosArchivados.length} torneo${torneosArchivados.length === 1 ? "" : "s"} archivado${torneosArchivados.length === 1 ? "" : "s"}`
                : `${torneosVisibles.length} torneo${torneosVisibles.length === 1 ? "" : "s"} activo${torneosVisibles.length === 1 ? "" : "s"}`}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {mostrarArchivados ? (
              <button
                type="button"
                onClick={() => setMostrarArchivados(false)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-surface"
              >
                <ArrowLeft size={16} />
                Volver a torneos activos
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMostrarArchivados(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-surface"
                >
                  <Archive size={16} />
                  Ver historial de torneos archivados
                  {torneosArchivados.length > 0 && (
                    <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-semibold text-foreground/60">
                      {torneosArchivados.length}
                    </span>
                  )}
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={abrirModalNuevo}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] sm:w-auto"
                  >
                    <span className="text-lg leading-none">+</span>
                    Nuevo Torneo
                  </button>
                )}
              </>
            )}
          </div>
        </header>

        {/* Listado de torneos */}
        {isLoading ? (
          <p className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
            Cargando...
          </p>
        ) : listaActual.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
              {mostrarArchivados ? (
                <Archive size={22} className="text-accent" />
              ) : (
                <Trophy size={22} className="text-accent" />
              )}
            </div>
            <p className="text-sm text-foreground/60">
              {mostrarArchivados
                ? "No hay torneos archivados todavía."
                : isAdmin
                  ? 'Todavía no creaste ningún torneo. Arrancá con "Nuevo Torneo".'
                  : "Todavía no hay torneos publicados."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listaActual.map((torneo) => {
              const estadoVisual = calcularEstadoVisual(torneo);

              return (
                <div
                  key={torneo.id}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-6 transition hover:border-accent/50"
                >
                  <Link
                    href={`/torneos/${torneo.id}`}
                    className="flex min-w-0 flex-1 flex-col"
                  >
                    <h2 className="break-words text-lg font-bold leading-snug text-foreground transition hover:text-accent">
                      {torneo.nombre}
                    </h2>

                    <span
                      className={`mt-2 w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${ESTADO_BADGE_STYLES[estadoVisual]}`}
                    >
                      {ESTADO_LABELS[estadoVisual]}
                    </span>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {torneo.categorias.map((categoria) => (
                        <span
                          key={categoria}
                          className="inline-block rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground/80"
                        >
                          {categoria}
                        </span>
                      ))}
                    </div>
                  </Link>

                  {isAdmin && (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuAbiertoId((prev) =>
                            prev === torneo.id ? null : torneo.id
                          );
                        }}
                        aria-label="Más opciones"
                        className="-mr-1 -mt-1 rounded-lg p-2 text-foreground/50 transition hover:bg-background hover:text-foreground"
                      >
                        <MoreVertical size={18} />
                      </button>

                      {menuAbiertoId === torneo.id && (
                        <div
                          onClick={(event) => event.stopPropagation()}
                          className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-surface shadow-xl shadow-black/40"
                        >
                          <button
                            type="button"
                            onClick={() => abrirModalEdicion(torneo)}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground/80 transition hover:bg-background hover:text-foreground"
                          >
                            <Pencil size={14} />
                            Editar
                          </button>
                          {estadoVisual === "inscripcion" && (
                            <button
                              type="button"
                              onClick={() =>
                                handleCerrarInscripcionManualmente(torneo)
                              }
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground/80 transition hover:bg-background hover:text-foreground"
                            >
                              <Lock size={14} />
                              Cerrar inscripción manualmente
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEliminarTorneo(torneo.id)}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-500/80 transition hover:bg-red-500/10 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Configuración de Torneo (nuevo o edición) */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-4"
          onClick={cerrarModal}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-6 pt-6 sm:px-8 sm:pt-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  Configuración de Torneo
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  {torneoEditando ? "Editar Torneo" : "Nuevo Torneo"}
                </h2>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                aria-label="Cerrar"
                className="text-foreground/50 transition hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form
              key={torneoEditando?.id ?? "nuevo"}
              onSubmit={handleGuardarTorneo}
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* Campos scrolleables: el modal no se corta en pantallas chicas */}
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
                <div className="space-y-1.5">
                  <label
                    htmlFor="nombre"
                    className="block text-sm font-medium text-foreground/80"
                  >
                    Nombre del torneo
                  </label>
                  <input
                    id="nombre"
                    name="nombre"
                    type="text"
                    required
                    defaultValue={torneoEditando?.nombre ?? ""}
                    placeholder="Ej: Torneo Apertura 2026"
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/30 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="fecha_inicio"
                    className="block text-sm font-medium text-foreground/80"
                  >
                    Fecha de inicio
                  </label>
                  <input
                    id="fecha_inicio"
                    name="fecha_inicio"
                    type="date"
                    required
                    defaultValue={torneoEditando?.fecha_inicio ?? ""}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 [color-scheme:dark]"
                  />
                  <p className="text-xs text-foreground/40">
                    No hace falta fecha de fin: el torneo se da por terminado
                    cuando se consagra un campeón en la Final.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="fecha_apertura_inscripcion"
                      className="block text-sm font-medium text-foreground/80"
                    >
                      Apertura de inscripción
                    </label>
                    <input
                      id="fecha_apertura_inscripcion"
                      name="fecha_apertura_inscripcion"
                      type="date"
                      defaultValue={
                        torneoEditando?.fecha_apertura_inscripcion ?? ""
                      }
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 [color-scheme:dark]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="fecha_cierre_inscripcion"
                      className="block text-sm font-medium text-foreground/80"
                    >
                      Cierre de inscripción
                    </label>
                    <input
                      id="fecha_cierre_inscripcion"
                      name="fecha_cierre_inscripcion"
                      type="datetime-local"
                      defaultValue={toDatetimeLocalValue(
                        torneoEditando?.fecha_cierre_inscripcion ?? null
                      )}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 [color-scheme:dark]"
                    />
                  </div>
                </div>
                <p className="-mt-4 text-xs text-foreground/40">
                  Al llegar la fecha y hora de cierre, la tarjeta pasa a
                  mostrar &quot;Torneo en curso&quot; automáticamente. Ambos
                  campos son opcionales.
                </p>

                <div className="space-y-2">
                  <p className="block text-sm font-medium text-foreground/80">
                    Categorías habilitadas
                  </p>
                  {/* flex-wrap: las viñetas largas (ej. "4ta/5ta Caballeros")
                      ocupan el ancho que necesitan en una sola línea */}
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIAS_JUGADOR.map((categoria) => (
                      <label key={categoria} className="cursor-pointer">
                        <input
                          type="checkbox"
                          name="categorias"
                          value={categoria}
                          defaultChecked={torneoEditando?.categorias.includes(
                            categoria
                          )}
                          className="peer sr-only"
                        />
                        <span className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium leading-none text-foreground/60 transition peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-accent">
                          {categoria}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-foreground/40">
                    Elegí al menos una categoría.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="formato"
                    className="block text-sm font-medium text-foreground/80"
                  >
                    Formato del Torneo
                  </label>
                  <select
                    id="formato"
                    name="formato"
                    required
                    defaultValue={normalizarFormatoTorneo(
                      torneoEditando?.formato
                    )}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                  >
                    {FORMATOS_TORNEO.map((formato) => (
                      <option key={formato} value={formato}>
                        {FORMATO_TORNEO_LABELS[formato]}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-foreground/40">
                    Define las pestañas y fases que se van a mostrar en el
                    detalle del torneo.
                  </p>
                </div>
              </div>

              {/* Acciones fijas al pie del modal */}
              <div className="flex shrink-0 gap-3 border-t border-border bg-surface px-6 py-4 sm:px-8">
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98]"
                >
                  {torneoEditando ? "Guardar cambios" : "Crear torneo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
