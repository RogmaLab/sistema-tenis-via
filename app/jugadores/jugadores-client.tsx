"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Filter, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { useAuth } from "@/components/auth-provider";
import {
  CATEGORIAS_FICHA,
  GENEROS,
  esCategoriaFicha,
  type CategoriaJugador,
  type Genero,
  type Jugador,
} from "@/lib/types";
import { nombreJugador } from "@/lib/nombre";

type FiltroCategoria = CategoriaJugador | "todas";
type FiltroGenero = Genero | "todos";

function whatsappHref(numero: string) {
  // wa.me solo acepta dígitos (código de país + número), sin "+", espacios ni guiones.
  return `https://wa.me/${numero.replace(/\D/g, "")}`;
}

export function JugadoresClient() {
  const { isAdmin, loading: authLoading } = useAuth();
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
    const desdeVista = await supabase
      .from("jugadores_listado")
      .select("id, numero_jugador, nombre_completo, whatsapp, categoria, genero, created_at")
      .order("created_at", { ascending: false });

    let filas: {
      id: string;
      numero_jugador?: number | null;
      nombre_completo: string;
      whatsapp?: string | null;
      categoria: string;
      genero: string;
      created_at?: string;
    }[] | null = null;

    if (!desdeVista.error) {
      filas = desdeVista.data;
    } else if (isAdmin) {
      const { data, error } = await supabase
        .from("jugadores")
        .select("id, numero_jugador, nombre_completo, whatsapp, categoria, genero, created_at")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error al cargar jugadores:", error.message);
        return null;
      }
      filas = data;
    } else {
      const { data, error } = await supabase
        .from("jugadores")
        .select("id, numero_jugador, nombre_completo, categoria, genero, created_at")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error al cargar jugadores:", error.message);
        return null;
      }
      filas = data;
    }

    return (filas ?? []).map((jugador) => ({
      id: jugador.id,
      numero_jugador: jugador.numero_jugador ?? null,
      nombre_completo: jugador.nombre_completo,
      categoria: jugador.categoria,
      genero: jugador.genero,
      whatsapp: isAdmin ? (jugador.whatsapp ?? "") : "",
    }));
  }, [supabase, isAdmin]);

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
    if (authLoading) return;

    let ignore = false;

    fetchJugadoresDesdeSupabase().then((data) => {
      if (ignore) return;
      if (data) setJugadores(data);
      setIsLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [authLoading, fetchJugadoresDesdeSupabase]);

  const hayFiltrosActivos =
    filtroCategoria !== "todas" || filtroGenero !== "todos";

  const jugadoresFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    const filtrados = jugadores.filter((jugador) => {
      const numero = jugador.numero_jugador != null ? String(jugador.numero_jugador) : "";
      const coincideNombre =
        !termino ||
        jugador.nombre_completo.toLowerCase().includes(termino) ||
        nombreJugador(jugador).toLowerCase().includes(termino) ||
        numero.includes(termino) ||
        `#${numero}`.includes(termino);
      const coincideCategoria =
        filtroCategoria === "todas" || jugador.categoria === filtroCategoria;
      const coincideGenero =
        filtroGenero === "todos" || jugador.genero === filtroGenero;
      return coincideNombre && coincideCategoria && coincideGenero;
    });

    if (!isAdmin) return filtrados;

    return [...filtrados].sort(
      (a, b) => (a.numero_jugador ?? 999999) - (b.numero_jugador ?? 999999)
    );
  }, [jugadores, busqueda, filtroCategoria, filtroGenero, isAdmin]);

  function abrirModalNuevo() {
    if (!isAdmin) return;
    setJugadorEditando(null);
    setIsModalOpen(true);
  }

  function abrirModalEdicion(jugador: Jugador) {
    if (!isAdmin) return;
    setJugadorEditando(jugador);
    setIsModalOpen(true);
  }

  function cerrarModal() {
    setIsModalOpen(false);
    setJugadorEditando(null);
  }

  async function handleGuardarJugador(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

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
    if (!isAdmin) return;
    const confirmado = window.confirm(
      "¿Seguro que querés eliminar esta ficha?"
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
    <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Encabezado del panel */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Comunidad
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            {jugadores.length === 1
              ? "1 ficha en el club"
              : `${jugadores.length} fichas en el club`}
          </p>
        </header>

        {/* Barra de acciones: buscador + filtros + nuevo jugador */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar por nombre..."
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
              Nueva ficha
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
                {CATEGORIAS_FICHA.map((categoria) => (
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
                      {isAdmin && (
                        <th className="w-14 px-3 py-3 font-medium sm:px-4">
                          Nº
                        </th>
                      )}
                      <th className="px-4 py-3 font-medium sm:px-6">Nombre</th>
                      {isAdmin && (
                        <th className="px-4 py-3 font-medium sm:px-6">
                          WhatsApp
                        </th>
                      )}
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
                        {isAdmin && (
                          <td className="px-3 py-3 font-semibold tabular-nums text-foreground/70 sm:px-4">
                            {jugador.numero_jugador != null
                              ? `#${jugador.numero_jugador}`
                              : "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 font-medium sm:px-6">
                          <Link
                            href={`/jugadores/${jugador.id}`}
                            className="text-foreground transition hover:text-accent hover:underline"
                          >
                            {nombreJugador(jugador)}
                          </Link>
                        </td>
                        {isAdmin && (
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
                        )}
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
                                aria-label={`Editar a ${nombreJugador(jugador)}`}
                                className="inline-flex items-center justify-center rounded-lg p-2 text-foreground/50 transition hover:bg-foreground/10 hover:text-foreground"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEliminarJugador(jugador.id)}
                                aria-label={`Eliminar a ${nombreJugador(jugador)}`}
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
                    ? "Todavía no hay fichas en el club."
                    : "Ningún nombre coincide con la búsqueda o los filtros."}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal: Nuevo Jugador / Editar Jugador */}
      {isModalOpen && isAdmin && (
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
                {jugadorEditando ? "Editar ficha" : "Nueva ficha"}
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
                  placeholder="Ej: Ana López"
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
                  {jugadorEditando &&
                  !esCategoriaFicha(jugadorEditando.categoria) &&
                  jugadorEditando.categoria ? (
                    <option value={jugadorEditando.categoria}>
                      {jugadorEditando.categoria}
                    </option>
                  ) : null}
                  {CATEGORIAS_FICHA.map((categoria) => (
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
