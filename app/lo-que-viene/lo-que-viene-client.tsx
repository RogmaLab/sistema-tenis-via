"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { CalendarClock, MapPin, Pencil, Plus, Trophy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { CATEGORIAS_JUGADOR, type CategoriaJugador, type TorneoFuturo } from "@/lib/types";
import { formatFecha, formatFechaHorario } from "@/lib/datetime";
import {
  eliminarTorneoFuturo,
  etiquetaFasePartido,
  fetchProximosPartidos,
  fetchTorneosFuturos,
  guardarTorneoFuturo,
  nombreEnAgenda,
  type ProximoPartido,
} from "@/lib/lo-que-viene";
import { FiltrosCategorias } from "@/components/FiltrosCategorias";
import { BadgeEnCancha, estaEnCancha } from "@/components/BadgeEnCancha";

type Pestana = "partidos" | "torneos";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30";

function ymdLocal(iso: string) {
  const fecha = new Date(iso);
  const pad = (valor: number) => String(valor).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

export function LoQueVieneClient() {
  const { isAdmin } = useAuth();
  const [pestana, setPestana] = useState<Pestana>("partidos");
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaJugador | "todas">("todas");
  const [partidos, setPartidos] = useState<ProximoPartido[]>([]);
  const [torneos, setTorneos] = useState<TorneoFuturo[]>([]);
  const [cargandoPartidos, setCargandoPartidos] = useState(true);
  const [cargandoTorneos, setCargandoTorneos] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [torneoEditando, setTorneoEditando] = useState<TorneoFuturo | null>(null);

  const cargarPartidos = useCallback(async () => {
    try {
      const data = await fetchProximosPartidos();
      setPartidos(data);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los próximos partidos."
      );
    } finally {
      setCargandoPartidos(false);
    }
  }, []);

  const cargarTorneos = useCallback(async () => {
    try {
      const data = await fetchTorneosFuturos();
      setTorneos(data);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los próximos torneos."
      );
    } finally {
      setCargandoTorneos(false);
    }
  }, []);

  useEffect(() => {
    void cargarPartidos();
    void cargarTorneos();
  }, [cargarPartidos, cargarTorneos]);

  // Filtrar partidos por categoría
  const partidosFiltrados = useMemo(() => {
    if (filtroCategoria === "todas") return partidos;
    return partidos.filter((partido) => partido.categoria === filtroCategoria);
  }, [partidos, filtroCategoria]);

  // Calcular conteos por categoría
  const conteosPorCategoria = useMemo(() => {
    const conteos: Record<string, number> = {
      todas: partidos.length,
      "3ra": 0,
      "4ta": 0,
      "5ta": 0,
      Damas: 0,
    };

    partidos.forEach((partido) => {
      if (partido.categoria) {
        const categoria = partido.categoria as keyof typeof conteos;
        if (categoria in conteos) {
          conteos[categoria]++;
        }
      }
    });

    return conteos;
  }, [partidos]);

  const partidosPorDia = useMemo(() => {
    const grupos: { fecha: string; partidos: ProximoPartido[] }[] = [];
    const indice = new Map<string, number>();
    for (const partido of partidosFiltrados) {
      const clave = ymdLocal(partido.fecha_programada);
      const existente = indice.get(clave);
      if (existente == null) {
        indice.set(clave, grupos.length);
        grupos.push({ fecha: clave, partidos: [partido] });
      } else {
        grupos[existente].partidos.push(partido);
      }
    }
    return grupos;
  }, [partidosFiltrados]);

  function abrirModalNuevo() {
    if (!isAdmin) return;
    setTorneoEditando(null);
    setIsModalOpen(true);
  }

  function abrirModalEdicion(torneo: TorneoFuturo) {
    if (!isAdmin) return;
    setTorneoEditando(torneo);
    setIsModalOpen(true);
  }

  function cerrarModal() {
    setIsModalOpen(false);
    setTorneoEditando(null);
  }

  async function handleGuardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const titulo = formData.get("titulo")?.toString().trim() ?? "";
    const descripcion = formData.get("descripcion")?.toString().trim() || null;
    const fechaInicio = formData.get("fecha_inicio")?.toString() ?? "";
    const fechaFin = formData.get("fecha_fin")?.toString() || null;
    const categorias = formData
      .getAll("categorias")
      .map((valor) => valor.toString());

    if (!titulo || !fechaInicio) return;
    if (categorias.length === 0) {
      toast.error("Elegí al menos una categoría.");
      return;
    }
    if (fechaFin && fechaFin < fechaInicio) {
      toast.error("La fecha de fin no puede ser anterior al inicio.");
      return;
    }

    try {
      await guardarTorneoFuturo({
        id: torneoEditando?.id,
        titulo,
        descripcion,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        categorias,
      });
      toast.success(
        torneoEditando ? "Anuncio actualizado." : "Próximo torneo publicado."
      );
      form.reset();
      cerrarModal();
      setCargandoTorneos(true);
      await cargarTorneos();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar."
      );
    }
  }

  async function handleEliminar(torneo: TorneoFuturo) {
    if (!isAdmin) return;
    const confirmado = window.confirm(
      `¿Eliminar el anuncio “${torneo.titulo}”?`
    );
    if (!confirmado) return;
    try {
      await eliminarTorneoFuturo(torneo.id);
      toast.success("Anuncio eliminado.");
      setCargandoTorneos(true);
      await cargarTorneos();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo eliminar."
      );
    }
  }

  return (
    <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Lo que viene
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Partidos programados y campeonatos que se vienen en el club.
          </p>
        </header>

        <div
          className="mb-6 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Secciones de lo que viene"
        >
          {(
            [
              { id: "partidos" as const, label: "Próximos Partidos" },
              { id: "torneos" as const, label: "Próximos Torneos" },
            ]
          ).map((item) => {
            const activa = pestana === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => setPestana(item.id)}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${
                  activa
                    ? "bg-accent text-white"
                    : "border border-border bg-surface text-foreground/60 hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {pestana === "partidos" ? (
          cargandoPartidos ? (
            <p className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
              Cargando...
            </p>
          ) : partidos.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
              <CalendarClock size={22} className="text-accent" />
              <p className="text-sm text-foreground/60">
                Todavía no hay partidos con horario a futuro.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Filtros de categoría */}
              <div>
                <FiltrosCategorias
                  categoriaActiva={filtroCategoria}
                  onCambiarCategoria={setFiltroCategoria}
                  conteos={conteosPorCategoria}
                />
              </div>

              {/* Mensaje si no hay resultados con el filtro */}
              {partidosFiltrados.length === 0 ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
                  <CalendarClock size={22} className="text-accent" />
                  <p className="text-sm text-foreground/60">
                    No hay partidos programados en la categoría{" "}
                    <strong>{filtroCategoria}</strong>.
                  </p>
                </div>
              ) : null}

              {/* Partidos agrupados por día */}
              {partidosPorDia.map((grupo) => (
                <section key={grupo.fecha}>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/50">
                    {formatFecha(grupo.fecha)}
                  </h2>
                  <div className="space-y-3">
                    {grupo.partidos.map((partido) => {
                      const enCancha = estaEnCancha({
                        fechaProgramada: partido.fecha_programada,
                        estado: partido.estado,
                      });

                      return (
                        <Link
                          key={partido.id}
                          href={
                            partido.torneo?.id
                              ? `/torneos/${partido.torneo.id}`
                              : "/torneos"
                          }
                          className="block rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/50 sm:p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              {nombreEnAgenda(partido.jugador_1)}{" "}
                              <span className="font-medium text-foreground/40">
                                vs
                              </span>{" "}
                              {nombreEnAgenda(partido.jugador_2)}
                            </p>
                            <p className="text-xs font-medium text-foreground/55">
                              {formatFechaHorario(partido.fecha_programada)}
                            </p>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-foreground/60">
                            {/* Badge EN CANCHA */}
                            {enCancha ? (
                              <BadgeEnCancha compacto />
                            ) : null}
                          {partido.cancha ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1">
                              <MapPin size={12} />
                              {partido.cancha}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-foreground/40">
                              Cancha a confirmar
                            </span>
                          )}
                          {partido.torneo?.nombre ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1">
                              <Trophy size={12} />
                              {partido.torneo.nombre}
                            </span>
                          ) : null}
                          {partido.categoria ? (
                            <span className="rounded-full border border-border px-2.5 py-1">
                              {partido.categoria}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-border px-2.5 py-1">
                            {etiquetaFasePartido(partido)}
                          </span>
                        </div>
                      </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )
        ) : (
          <div>
            {isAdmin ? (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={abrirModalNuevo}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98]"
                >
                  <Plus size={16} />
                  Nuevo Torneo Futuro
                </button>
              </div>
            ) : null}

            {cargandoTorneos ? (
              <p className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
                Cargando...
              </p>
            ) : torneos.length === 0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
                <Trophy size={22} className="text-accent" />
                <p className="text-sm text-foreground/60">
                  {isAdmin
                    ? 'Todavía no hay campeonatos anunciados. Publicá uno con "Nuevo Torneo Futuro".'
                    : "Todavía no hay campeonatos futuros anunciados."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {torneos.map((torneo) => (
                  <article
                    key={torneo.id}
                    className="flex flex-col rounded-2xl border border-border bg-surface p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                          {formatFecha(torneo.fecha_inicio)}
                          {torneo.fecha_fin
                            ? ` — ${formatFecha(torneo.fecha_fin)}`
                            : ""}
                        </p>
                        <h2 className="mt-1 text-lg font-bold text-foreground">
                          {torneo.titulo}
                        </h2>
                      </div>
                      {isAdmin ? (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => abrirModalEdicion(torneo)}
                            aria-label="Editar anuncio"
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground/50 transition hover:bg-background hover:text-foreground"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleEliminar(torneo)}
                            aria-label="Eliminar anuncio"
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground/50 transition hover:bg-red-500/10 hover:text-red-400"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {torneo.descripcion ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/65">
                        {torneo.descripcion}
                      </p>
                    ) : null}
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
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isModalOpen && isAdmin ? (
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
                  Lo que viene
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  {torneoEditando
                    ? "Editar torneo futuro"
                    : "Nuevo Torneo Futuro"}
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
              onSubmit={(event) => void handleGuardar(event)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
                <div className="space-y-1.5">
                  <label htmlFor="titulo" className="block text-sm font-medium text-foreground/80">
                    Título
                  </label>
                  <input
                    id="titulo"
                    name="titulo"
                    type="text"
                    required
                    defaultValue={torneoEditando?.titulo ?? ""}
                    placeholder="Ej: Torneo Clausura 2026"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="descripcion" className="block text-sm font-medium text-foreground/80">
                    Descripción
                  </label>
                  <textarea
                    id="descripcion"
                    name="descripcion"
                    rows={4}
                    defaultValue={torneoEditando?.descripcion ?? ""}
                    placeholder="Inscripción, premios, formato, lo que quieras anticipar."
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="fecha_inicio" className="block text-sm font-medium text-foreground/80">
                      Fecha de inicio
                    </label>
                    <input
                      id="fecha_inicio"
                      name="fecha_inicio"
                      type="date"
                      required
                      defaultValue={torneoEditando?.fecha_inicio?.slice(0, 10) ?? ""}
                      className={`${inputClass} [color-scheme:dark]`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="fecha_fin" className="block text-sm font-medium text-foreground/80">
                      Fecha de fin (opcional)
                    </label>
                    <input
                      id="fecha_fin"
                      name="fecha_fin"
                      type="date"
                      defaultValue={torneoEditando?.fecha_fin?.slice(0, 10) ?? ""}
                      className={`${inputClass} [color-scheme:dark]`}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="block text-sm font-medium text-foreground/80">
                    Categorías
                  </p>
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
                </div>
              </div>

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
                  {torneoEditando ? "Guardar cambios" : "Publicar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
