"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Filter, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { useAuth } from "@/components/auth-provider";
import {
  CATEGORIAS_JUGADOR,
  GENEROS,
  type CategoriaJugador,
  type Genero,
  type Jugador,
} from "@/lib/types";

type FiltroCategoria = CategoriaJugador | "todas";
type FiltroGenero = Genero | "todos";

function whatsappHref(numero: string) {
  // wa.me solo acepta dígitos (código de país + número), sin "+", espacios ni guiones.
  return `https://wa.me/${numero.replace(/\D/g, "")}`;
}

export function JugadoresClient() {
  const { isAdmin } = useAuth();
  const supabase = createClient();

  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [jugadorEditando, setJugadorEditando] = useState<Jugador | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>("todas");
  const [filtroGenero, setFiltroGenero] = useState<FiltroGenero>("todos");

  // Fetcher "puro": solo consulta Supabase y devuelve el resultado (o
  // `null` si hubo error), sin tocar ningún estado. Sirve de base tanto
  // para la carga inicial (efecto de más abajo) como para `cargarJugadores`,
  // que usan los handlers para recargar después de crear/editar/eliminar.
  const fetchJugadoresDesdeSupabase = useCallback(async () => {
    const { data, error } = await supabase
      .from("jugadores")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error al cargar jugadores:", error.message);
      return null;
    }

    return (data as Jugador[]) ?? [];
  }, [supabase]);

  // Usado por los handlers (crear/editar/eliminar): no es un efecto, así
  // que puede setear estado sin disparar react-hooks/set-state-in-effect.
  const cargarJugadores = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchJugadoresDesdeSupabase();
    if (data) setJugadores(data);
    setIsLoading(false);
  }, [fetchJugadoresDesdeSupabase]);

  // Carga inicial: el setState se escribe directamente acá adentro (después
  // del await, dentro del propio cuerpo del efecto) en vez de delegarlo a
  // una función aparte, para que el linter pueda verificar que no es una
  // llamada síncrona. `ignore` evita pisar el estado si el componente se
  // desmonta antes de que resuelva.
  useEffect(() => {
    let ignore = false;

    fetchJugadoresDesdeSupabase().then((data) => {
      if (ignore) return;
      if (data) setJugadores(data);
      setIsLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [fetchJugadoresDesdeSupabase]);

  const hayFiltrosActivos =
    filtroCategoria !== "todas" || filtroGenero !== "todos";

  const jugadoresFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return jugadores.filter((jugador) => {
      const coincideNombre =
        !termino || jugador.nombre_completo.toLowerCase().includes(termino);
      const coincideCategoria =
        filtroCategoria === "todas" || jugador.categoria === filtroCategoria;
      const coincideGenero =
        filtroGenero === "todos" || jugador.genero === filtroGenero;
      return coincideNombre && coincideCategoria && coincideGenero;
    });
  }, [jugadores, busqueda, filtroCategoria, filtroGenero]);

  function abrirModalNuevo() {
    setJugadorEditando(null);
    setIsModalOpen(true);
  }

  function abrirModalEdicion(jugador: Jugador) {
    setJugadorEditando(jugador);
    setIsModalOpen(true);
  }

  function cerrarModal() {
    setIsModalOpen(false);
    setJugadorEditando(null);
  }

  async function handleGuardarJugador(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const nombreCompleto = formData.get("nombre_completo")?.toString().trim();
    const whatsapp = formData.get("whatsapp")?.toString().trim();
    const genero = formData.get("genero")?.toString();
    const categoria = formData.get("categoria")?.toString();

    if (!nombreCompleto || !whatsapp || !genero || !categoria) return;

    if (jugadorEditando) {
      const { error } = await supabase
        .from("jugadores")
        .update({
          nombre_completo: nombreCompleto,
          whatsapp,
          categoria,
          genero,
        })
        .eq("id", jugadorEditando.id);

      if (error) {
        console.error("Error al actualizar jugador:", error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("jugadores").insert({
        nombre_completo: nombreCompleto,
        whatsapp,
        categoria,
        genero,
      });

      if (error) {
        console.error("Error al crear jugador:", error.message);
        return;
      }
    }

    form.reset();
    cerrarModal();
    await cargarJugadores();
  }

  async function handleEliminarJugador(id: string) {
    const confirmado = window.confirm(
      "¿Seguro que querés eliminar a este jugador?"
    );
    if (!confirmado) return;

    const { error } = await supabase.from("jugadores").delete().eq("id", id);

    if (error) {
      console.error("Error al eliminar jugador:", error.message);
      return;
    }

    await cargarJugadores();
  }

  function limpiarFiltros() {
    setFiltroCategoria("todas");
    setFiltroGenero("todos");
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Encabezado del panel */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Jugadores
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            {jugadores.length} jugadores inscriptos
          </p>
        </header>

        {/* Barra de acciones: buscador + filtros + nuevo jugador */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar jugador por nombre..."
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 sm:w-64"
            />

            <button
              type="button"
              onClick={() => setMostrarFiltros((prev) => !prev)}
              aria-label="Mostrar filtros"
              aria-pressed={mostrarFiltros}
              className={`relative inline-flex shrink-0 items-center justify-center rounded-lg border p-2.5 transition ${
                mostrarFiltros
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-surface text-foreground/70 hover:text-foreground"
              }`}
            >
              <Filter size={18} />
              {hayFiltrosActivos && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent" />
              )}
            </button>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={abrirModalNuevo}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] sm:w-auto"
            >
              <span className="text-lg leading-none">+</span>
              Nuevo Jugador
            </button>
          )}
        </div>

        {/* Panel de filtros (categoría / género) */}
        {mostrarFiltros && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label
                htmlFor="filtro_categoria"
                className="block text-sm font-medium text-foreground/80"
              >
                Categoría
              </label>
              <select
                id="filtro_categoria"
                value={filtroCategoria}
                onChange={(event) =>
                  setFiltroCategoria(event.target.value as FiltroCategoria)
                }
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              >
                <option value="todas">Todas las categorías</option>
                {CATEGORIAS_JUGADOR.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 space-y-1.5">
              <label
                htmlFor="filtro_genero"
                className="block text-sm font-medium text-foreground/80"
              >
                Género
              </label>
              <select
                id="filtro_genero"
                value={filtroGenero}
                onChange={(event) =>
                  setFiltroGenero(event.target.value as FiltroGenero)
                }
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              >
                <option value="todos">Todos los géneros</option>
                {GENEROS.map((genero) => (
                  <option key={genero} value={genero}>
                    {genero}
                  </option>
                ))}
              </select>
            </div>

            {hayFiltrosActivos && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="text-sm font-medium text-foreground/60 underline-offset-2 transition hover:text-foreground hover:underline sm:pb-2.5"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {/* Tabla de jugadores */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {isLoading ? (
            <p className="px-6 py-10 text-center text-sm text-foreground/50">
              Cargando...
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
                      <th className="px-4 py-3 font-medium sm:px-6">Nombre</th>
                      <th className="px-4 py-3 font-medium sm:px-6">
                        WhatsApp
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
                    {jugadoresFiltrados.map((jugador) => (
                      <tr
                        key={jugador.id}
                        className="border-b border-border last:border-0 hover:bg-background/40"
                      >
                        <td className="px-4 py-3 font-medium text-foreground sm:px-6">
                          {jugador.nombre_completo}
                        </td>
                        <td className="px-4 py-3 sm:px-6">
                          <a
                            href={whatsappHref(jugador.whatsapp)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-foreground/70 transition hover:text-foreground"
                          >
                            {jugador.whatsapp}
                            <WhatsAppIcon className="h-4 w-4 shrink-0 text-[#25D366]" />
                          </a>
                        </td>
                        <td className="px-4 py-3 sm:px-6">
                          <span className="inline-block rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground/80">
                            {jugador.categoria}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground/70 sm:px-6">
                          {jugador.genero}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 sm:px-6">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => abrirModalEdicion(jugador)}
                                aria-label={`Editar a ${jugador.nombre_completo}`}
                                className="inline-flex items-center justify-center rounded-lg p-2 text-foreground/50 transition hover:bg-foreground/10 hover:text-foreground"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEliminarJugador(jugador.id)}
                                aria-label={`Eliminar a ${jugador.nombre_completo}`}
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

              {jugadoresFiltrados.length === 0 && (
                <p className="px-6 py-10 text-center text-sm text-foreground/50">
                  {jugadores.length === 0
                    ? "Todavía no hay jugadores inscriptos."
                    : "No se encontraron jugadores que coincidan con la búsqueda o los filtros aplicados."}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal: Nuevo Jugador / Editar Jugador */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={cerrarModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40 sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {jugadorEditando ? "Editar Jugador" : "Nuevo Jugador"}
              </h2>
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
              key={jugadorEditando?.id ?? "nuevo"}
              onSubmit={handleGuardarJugador}
              className="space-y-5"
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="nombre_completo"
                  className="block text-sm font-medium text-foreground/80"
                >
                  Nombre completo
                </label>
                <input
                  id="nombre_completo"
                  name="nombre_completo"
                  type="text"
                  required
                  defaultValue={jugadorEditando?.nombre_completo ?? ""}
                  placeholder="Ej: Juan Pérez"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/30 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="whatsapp"
                  className="block text-sm font-medium text-foreground/80"
                >
                  WhatsApp
                </label>
                <input
                  id="whatsapp"
                  name="whatsapp"
                  type="tel"
                  required
                  defaultValue={jugadorEditando?.whatsapp ?? ""}
                  placeholder="Ej: +54 9 11 1234-5678"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/30 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="genero"
                  className="block text-sm font-medium text-foreground/80"
                >
                  Género
                </label>
                <select
                  id="genero"
                  name="genero"
                  required
                  defaultValue={jugadorEditando?.genero ?? ""}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                >
                  <option value="" disabled>
                    Seleccioná un género
                  </option>
                  {GENEROS.map((genero) => (
                    <option key={genero} value={genero}>
                      {genero}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="categoria"
                  className="block text-sm font-medium text-foreground/80"
                >
                  Categoría
                </label>
                <select
                  id="categoria"
                  name="categoria"
                  required
                  defaultValue={jugadorEditando?.categoria ?? ""}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                >
                  <option value="" disabled>
                    Seleccioná una categoría
                  </option>
                  {CATEGORIAS_JUGADOR.map((categoria) => (
                    <option key={categoria} value={categoria}>
                      {categoria}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
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
                  {jugadorEditando ? "Guardar cambios" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
