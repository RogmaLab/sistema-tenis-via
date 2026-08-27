"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { fetchMiJugador } from "@/lib/jugador-vinculado";
import {
  fetchResumenPerfil,
  type ResumenPerfil,
} from "@/lib/perfil-datos";
import {
  FichaPerfilJugador,
  type PestanaPerfil,
} from "@/components/FichaPerfilJugador";
import type { Jugador } from "@/lib/types";

export function PerfilClient() {
  const { user, loading, jugadorId, refreshPerfil } = useAuth();
  const supabase = createClient();

  const [jugador, setJugador] = useState<Jugador | null>(null);
  const [resumen, setResumen] = useState<ResumenPerfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [pestana, setPestana] = useState<PestanaPerfil>("datos");
  const [cambiandoClave, setCambiandoClave] = useState(false);

  const cargar = useCallback(async () => {
    if (!user) {
      setJugador(null);
      setResumen(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    const data = await fetchMiJugador(supabase, user.id);
    setJugador(data);
    if (data) {
      setResumen(await fetchResumenPerfil(supabase, data.id, data.categoria));
    } else {
      setResumen(null);
    }
    setCargando(false);
  }, [supabase, user]);

  useEffect(() => {
    if (loading) return;
    void cargar();
  }, [loading, cargar, jugadorId]);

  async function handleGuardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!jugador) return;

    const formData = new FormData(event.currentTarget);
    const nombreCompleto = formData.get("nombre_completo")?.toString().trim();
    const whatsapp = formData.get("whatsapp")?.toString().trim();
    const genero = formData.get("genero")?.toString();
    const categoria = formData.get("categoria")?.toString();

    if (!nombreCompleto || !whatsapp || !genero || !categoria) return;

    setGuardando(true);
    const { error } = await supabase
      .from("jugadores")
      .update({
        nombre_completo: nombreCompleto,
        whatsapp,
        categoria,
        genero,
      })
      .eq("id", jugador.id);

    setGuardando(false);

    if (error) {
      toast.error(error.message || "No se pudieron guardar los cambios.");
      return;
    }

    toast.success("Perfil actualizado.");
    await refreshPerfil();
    await cargar();
  }

  async function handleCambiarClave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.email) return;

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

  return (
    <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-2xl">
        {loading || cargando ? (
          <>
            <header className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Mi Perfil
              </h1>
              <p className="mt-1 text-sm text-foreground/60">
                Tu ficha, tus stats y la vitrina de copas.
              </p>
            </header>
            <p className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
              Cargando...
            </p>
          </>
        ) : !jugador ? (
          <>
            <header className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Mi Perfil
              </h1>
            </header>
            <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
              <p className="text-sm text-foreground/60">
                Todavía no hay una ficha vinculada a esta cuenta.
              </p>
              <Link
                href="/vincular-perfil"
                className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                Vinculá tu perfil
              </Link>
            </div>
          </>
        ) : (
          <FichaPerfilJugador
            titulo="Mi Perfil"
            subtitulo="Tu ficha, tus stats y la vitrina de copas."
            jugador={jugador}
            resumen={resumen}
            esPropio
            puedeEditarDatos
            mostrarWhatsapp
            mostrarConfig
            pestana={pestana}
            onPestana={setPestana}
            onGuardarDatos={handleGuardar}
            guardando={guardando}
            onCambiarClave={handleCambiarClave}
            cambiandoClave={cambiandoClave}
          />
        )}
      </div>
    </main>
  );
}
