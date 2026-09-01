"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { fetchJugadorPorId } from "@/lib/jugador-vinculado";
import {
  fetchResumenPerfil,
  type ResumenPerfil,
} from "@/lib/perfil-datos";
import {
  FichaPerfilJugador,
  type PestanaPerfil,
} from "@/components/FichaPerfilJugador";
import type { Jugador } from "@/lib/types";
import { nombreJugador } from "@/lib/nombre";

export function JugadorPerfilClient() {
  const params = useParams<{ id: string }>();
  const jugadorIdRuta = params.id ?? "";
  const { user, loading, isAdmin, jugadorId, refreshPerfil } = useAuth();
  const supabase = createClient();

  const [jugador, setJugador] = useState<Jugador | null>(null);
  const [resumen, setResumen] = useState<ResumenPerfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [pestana, setPestana] = useState<PestanaPerfil>("datos");
  const [cambiandoClave, setCambiandoClave] = useState(false);

  const esPropio = Boolean(jugadorId && jugadorId === jugador?.id);

  const cargar = useCallback(async () => {
    if (!jugadorIdRuta) {
      setJugador(null);
      setResumen(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    const data = await fetchJugadorPorId(supabase, jugadorIdRuta);
    setJugador(data);
    if (data) {
      setResumen(await fetchResumenPerfil(supabase, data.id, data.categoria));
    } else {
      setResumen(null);
    }
    setCargando(false);
  }, [supabase, jugadorIdRuta]);

  useEffect(() => {
    if (loading) return;
    void cargar();
  }, [loading, cargar]);

  async function handleGuardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!jugador || (!isAdmin && !esPropio)) return;

    const formData = new FormData(event.currentTarget);
    const nombreCompleto = formData.get("nombre_completo")?.toString().trim();
    const whatsapp = formData.get("whatsapp")?.toString().trim() ?? jugador.whatsapp;
    const genero = formData.get("genero")?.toString();
    const categoria = formData.get("categoria")?.toString();

    if (!nombreCompleto || !genero || !categoria) return;

    const payload: Record<string, string> = {
      nombre_completo: nombreCompleto,
      categoria,
      genero,
    };
    if (whatsapp) payload.whatsapp = whatsapp;

    setGuardando(true);
    const { error } = await supabase
      .from("jugadores")
      .update(payload)
      .eq("id", jugador.id);

    setGuardando(false);

    if (error) {
      toast.error(error.message || "No se pudieron guardar los cambios.");
      return;
    }

    toast.success("Perfil actualizado.");
    if (esPropio) await refreshPerfil();
    await cargar();
  }

  async function handleCambiarClave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.email || !esPropio) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const actual = formData.get("password_actual")?.toString() ?? "";
    const nueva = formData.get("password_nueva")?.toString() ?? "";
    const repetir = formData.get("password_repetir")?.toString() ?? "";

    if (nueva.length < 8) {
      toast.error("La contraseña nueva tiene que tener al menos 8 caracteres.");
      return;
    }
    if (nueva !== repetir) {
      toast.error("Las contraseñas nuevas no coinciden.");
      return;
    }

    setCambiandoClave(true);
    const { error: errorAuth } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: actual,
    });
    if (errorAuth) {
      setCambiandoClave(false);
      toast.error("La contraseña actual no es correcta.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: nueva });
    setCambiandoClave(false);

    if (error) {
      toast.error(error.message || "No se pudo cambiar la contraseña.");
      return;
    }

    form.reset();
    toast.success("Contraseña actualizada.");
  }

  const puedeEditarDatos = isAdmin || esPropio;
  const mostrarWhatsapp = isAdmin || esPropio;

  return (
    <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-2xl">
        {loading || cargando ? (
          <>
            <header className="mb-6">
              <Link
                href="/jugadores"
                className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/60"
              >
                Volver a Comunidad
              </Link>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Perfil
              </h1>
            </header>
            <p className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
              Cargando...
            </p>
          </>
        ) : !jugador ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm text-foreground/60">
              No encontramos esta ficha.
            </p>
            <Link
              href="/jugadores"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Volver al listado
            </Link>
          </div>
        ) : (
          <FichaPerfilJugador
            titulo={nombreJugador(jugador)}
            subtitulo="Rendimiento, ranking y vitrina de copas."
            volver={{ href: "/jugadores", label: "Volver a Comunidad" }}
            jugador={jugador}
            resumen={resumen}
            esPropio={esPropio}
            puedeEditarDatos={puedeEditarDatos}
            mostrarWhatsapp={mostrarWhatsapp}
            mostrarConfig={esPropio}
            pestana={pestana}
            onPestana={setPestana}
            onGuardarDatos={handleGuardar}
            guardando={guardando}
            onCambiarClave={esPropio ? handleCambiarClave : undefined}
            cambiandoClave={cambiandoClave}
          />
        )}
      </div>
    </main>
  );
}
