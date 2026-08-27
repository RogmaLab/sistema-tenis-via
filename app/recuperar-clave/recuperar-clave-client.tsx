"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { destinoDespuesDeAuth } from "@/lib/auth/destino-post-auth";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/30 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30";

export function RecuperarClaveClient() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = formData.get("password")?.toString() ?? "";
    const repetir = formData.get("password_repetir")?.toString() ?? "";

    if (password.length < 8) {
      toast.error("La contraseña tiene que tener al menos 8 caracteres.");
      return;
    }
    if (password !== repetir) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }

    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setGuardando(false);
      toast.error(error.message || "No se pudo guardar la contraseña.");
      return;
    }

    const { data } = await supabase.auth.getUser();
    const destino = data.user
      ? await destinoDespuesDeAuth(supabase, data.user.id)
      : "/login";
    setGuardando(false);
    toast.success("Contraseña actualizada.");
    router.replace(destino);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40 sm:p-8">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Lock size={20} />
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          Nueva contraseña
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          Elegí una clave nueva para tu cuenta de Tenis La Vía.
        </p>

        {loading ? (
          <p className="mt-6 text-sm text-foreground/50">Cargando...</p>
        ) : !user ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              El link expiró o no es válido. Pedí uno nuevo desde el login.
            </p>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline"
            >
              Volver a ingresar
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-foreground/80"
              >
                Contraseña nueva
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="password_repetir"
                className="block text-sm font-medium text-foreground/80"
              >
                Repetir contraseña
              </label>
              <input
                id="password_repetir"
                name="password_repetir"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={guardando}
              className="flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {guardando ? "Guardando..." : "Guardar contraseña"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
