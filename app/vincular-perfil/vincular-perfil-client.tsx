"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { LogoutButton } from "@/components/LogoutButton";
import { listarJugadoresSinVincular } from "@/lib/jugador-vinculado";
import {
  CATEGORIAS_FICHA,
  GENEROS,
  type CategoriaFicha,
  type Genero,
} from "@/lib/types";
import { nombreJugador } from "@/lib/nombre";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/30 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30";

export function VincularPerfilClient() {
  const { user, isAdmin, loading, jugadorId, refreshPerfil } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [jugadores, setJugadores] = useState<
    Awaited<ReturnType<typeof listarJugadoresSinVincular>>
  >([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [vinculandoId, setVinculandoId] = useState<string | null>(null);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [creando, setCreando] = useState(false);

  const cargarLista = useCallback(async () => {
    setCargandoLista(true);
    const data = await listarJugadoresSinVincular(supabase);
    setJugadores(data);
    setCargandoLista(false);
  }, [supabase]);

  useEffect(() => {
    void cargarLista();
  }, [cargarLista]);

  useEffect(() => {
    if (!loading && jugadorId) {
      router.replace("/perfil");
    }
  }, [loading, jugadorId, router]);

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return jugadores;
    return jugadores.filter((jugador) =>
      jugador.nombre_completo.toLowerCase().includes(termino) ||
      nombreJugador(jugador).toLowerCase().includes(termino)
    );
  }, [jugadores, busqueda]);

  async function handleVincular(jugadorIdElegido: string, nombre: string) {
    const confirmado = window.confirm(
      `¿Confirmás que sos ${nombreJugador(nombre)}? Vas a vincular este perfil a tu cuenta.`
    );
    if (!confirmado) return;

    setVinculandoId(jugadorIdElegido);
    const { error } = await supabase.rpc("vincular_mi_jugador", {
      p_jugador_id: jugadorIdElegido,
    });
    setVinculandoId(null);

    if (error) {
      toast.error(error.message || "No se pudo vincular el perfil.");
      return;
    }

    toast.success("Perfil vinculado.");
    await refreshPerfil();
    router.replace("/perfil");
  }

  async function handleCrear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const nombreCompleto = formData.get("nombre_completo")?.toString().trim();
    const whatsapp = formData.get("whatsapp")?.toString().trim();
    const genero = formData.get("genero")?.toString();
    const categoria = formData.get("categoria")?.toString();

    if (!nombreCompleto || !whatsapp || !genero || !categoria) return;

    setCreando(true);
    const { error } = await supabase.from("jugadores").insert({
      nombre_completo: nombreCompleto,
      whatsapp,
      categoria,
      genero,
      user_id: user.id,
    });
    setCreando(false);

    if (error) {
      toast.error(error.message || "No se pudo crear el perfil.");
      return;
    }

    toast.success("Perfil creado.");
    await refreshPerfil();
    router.replace("/perfil");
  }

  if (loading) {
    return (
      <p className="px-6 py-16 text-center text-sm text-foreground/50">
        Cargando...
      </p>
    );
  }

  return (
    <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-lg">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Hola
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Vinculá tu perfil
            </h1>
            <p className="mt-2 text-sm text-foreground/60">
              {isAdmin
                ? "Si también jugás en el club, asociá tu cuenta a una ficha o creá una nueva."
                : "Buscá tu nombre en la lista del club. Si ya figura, no hace falta crear otra ficha."}
            </p>
          </div>
          <LogoutButton className="shrink-0" />
        </header>

        <div className="relative mb-4">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar por nombre..."
            className={`${inputClass} pl-9`}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {cargandoLista ? (
            <p className="px-6 py-10 text-center text-sm text-foreground/50">
              Cargando fichas...
            </p>
          ) : filtrados.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-foreground/50">
              {jugadores.length === 0
                ? "No hay fichas libres para vincular. Creá tu perfil nuevo."
                : "Ningún nombre coincide con la búsqueda."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtrados.map((jugador) => (
                <li
                  key={jugador.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {nombreJugador(jugador)}
                    </p>
                    <p className="text-xs text-foreground/50">
                      {jugador.categoria} · {jugador.genero}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={vinculandoId !== null}
                    onClick={() =>
                      handleVincular(jugador.id, jugador.nombre_completo)
                    }
                    className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {vinculandoId === jugador.id ? "Vinculando..." : "Es mi perfil"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8">
          {mostrarAlta ? (
            <form
              onSubmit={handleCrear}
              className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6"
            >
              <h2 className="text-base font-semibold text-foreground">
                Crear mi perfil nuevo
              </h2>
              <div className="space-y-1.5">
                <label htmlFor="nombre_completo" className="block text-sm font-medium text-foreground/80">
                  Nombre completo
                </label>
                <input
                  id="nombre_completo"
                  name="nombre_completo"
                  type="text"
                  required
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="whatsapp" className="block text-sm font-medium text-foreground/80">
                  WhatsApp
                </label>
                <input
                  id="whatsapp"
                  name="whatsapp"
                  type="tel"
                  required
                  placeholder="Ej: +54 9 11 1234-5678"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="genero" className="block text-sm font-medium text-foreground/80">
                  Género
                </label>
                <select id="genero" name="genero" required defaultValue="" className={inputClass}>
                  <option value="" disabled>
                    Seleccioná un género
                  </option>
                  {GENEROS.map((genero: Genero) => (
                    <option key={genero} value={genero}>
                      {genero}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="categoria" className="block text-sm font-medium text-foreground/80">
                  Categoría
                </label>
                <select id="categoria" name="categoria" required defaultValue="" className={inputClass}>
                  <option value="" disabled>
                    Seleccioná una categoría
                  </option>
                  {CATEGORIAS_FICHA.map((categoria: CategoriaFicha) => (
                    <option key={categoria} value={categoria}>
                      {categoria}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setMostrarAlta(false)}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
                >
                  Volver a la lista
                </button>
                <button
                  type="submit"
                  disabled={creando}
                  className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creando ? "Creando..." : "Crear perfil"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setMostrarAlta(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground/80 transition hover:bg-background hover:text-foreground"
            >
              <UserPlus size={16} />
              No estoy en la lista — Crear mi perfil nuevo
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
