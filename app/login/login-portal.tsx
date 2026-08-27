"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { destinoDespuesDeAuth } from "@/lib/auth/destino-post-auth";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/30 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30";

type ModoAuth = "login" | "registro" | "recuperar";

function mensajeSignup(raw: string) {
  const texto = raw.toLowerCase();
  if (texto.includes("already") || texto.includes("registered")) {
    return "Ese email ya tiene una cuenta. Iniciá sesión.";
  }
  if (texto.includes("password")) {
    return "La contraseña no cumple los requisitos. Probá con 8 caracteres o más.";
  }
  return "No se pudo crear la cuenta. Probá de nuevo.";
}

export function LoginPortal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [modo, setModo] = useState<ModoAuth>("login");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const redirectTo = searchParams.get("redirect_to");
  const errorAuth = searchParams.get("error") === "auth";

  function cambiarModo(siguiente: ModoAuth) {
    setModo(siguiente);
    setError(null);
    setAviso(null);
  }

  async function redirigirSegunRol() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.push("/");
      router.refresh();
      return;
    }
    const destino = await destinoDespuesDeAuth(
      supabase,
      data.user.id,
      redirectTo
    );
    router.push(destino);
    router.refresh();
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAviso(null);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email")?.toString().trim();
    const password = formData.get("password")?.toString();
    if (!email || !password) return;

    setIsLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setIsLoading(false);
      setError("Email o contraseña incorrectos.");
      return;
    }
    try {
      await redirigirSegunRol();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegistro(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAviso(null);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email")?.toString().trim();
    const password = formData.get("password")?.toString() ?? "";
    const repetir = formData.get("password_repetir")?.toString() ?? "";
    if (!email || !password) return;

    if (password.length < 8) {
      setError("La contraseña tiene que tener al menos 8 caracteres.");
      return;
    }
    if (password !== repetir) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setIsLoading(true);
    const origin = window.location.origin;
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/vincular-perfil`,
      },
    });
    setIsLoading(false);

    if (signUpError) {
      setError(mensajeSignup(signUpError.message));
      return;
    }

    if (data.session) {
      router.push("/vincular-perfil");
      router.refresh();
      return;
    }

    setAviso(
      "Te mandamos un email para confirmar la cuenta. Cuando lo abras, vas a poder vincular tu perfil de jugador."
    );
  }

  async function handleRecuperar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAviso(null);

    const email = new FormData(event.currentTarget)
      .get("email")
      ?.toString()
      .trim();
    if (!email) return;

    setIsLoading(true);
    const origin = window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${origin}/auth/callback?next=/recuperar-clave` }
    );
    setIsLoading(false);

    if (resetError) {
      setError("No se pudo enviar el email. Probá de nuevo en un rato.");
      return;
    }

    setAviso(
      "Si ese email está registrado, te mandamos un link para crear una contraseña nueva."
    );
  }

  const titulo =
    modo === "registro"
      ? "Creá tu cuenta"
      : modo === "recuperar"
        ? "Recuperar contraseña"
        : "Ingresá a tu cuenta";

  const subtitulo =
    modo === "registro"
      ? "Registrate para ver torneos, ranking y tu perfil de jugador."
      : modo === "recuperar"
        ? "Escribí tu email y te mandamos el link de recuperación."
        : "Jugadores y organizadores, el mismo acceso.";

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40 sm:p-8">
      <div className="mb-6 flex flex-col items-center gap-4 text-center">
        <Image
          src="/logo-tenis-la-via.png"
          alt="Tenis La Vía"
          width={507}
          height={205}
          priority
          className="h-12 w-auto"
        />
        <div>
          <h1 className="text-lg font-semibold text-foreground">Tenis La Vía</h1>
          <p className="mt-1 text-sm text-foreground/60">{subtitulo}</p>
        </div>
      </div>

      {modo !== "recuperar" ? (
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1">
          <button
            type="button"
            onClick={() => cambiarModo("login")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              modo === "login"
                ? "bg-accent text-white"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => cambiarModo("registro")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              modo === "registro"
                ? "bg-accent text-white"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Crear cuenta
          </button>
        </div>
      ) : null}

      <p className="mb-4 text-sm font-medium text-foreground">{titulo}</p>

      {errorAuth && modo === "login" && !error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          El link de confirmación no es válido o expiró. Probá de nuevo.
        </p>
      ) : null}

      {modo === "login" ? (
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-foreground/80">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="tu@email.com"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-foreground/80">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => cambiarModo("recuperar")}
              className="text-sm font-medium text-accent hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn size={16} />
            {isLoading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      ) : null}

      {modo === "registro" ? (
        <form onSubmit={handleRegistro} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email_registro" className="block text-sm font-medium text-foreground/80">
              Email
            </label>
            <input
              id="email_registro"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="tu@email.com"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password_registro" className="block text-sm font-medium text-foreground/80">
              Contraseña
            </label>
            <input
              id="password_registro"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Mínimo 8 caracteres"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password_repetir" className="block text-sm font-medium text-foreground/80">
              Confirmar contraseña
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
          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          ) : null}
          {aviso ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {aviso}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <UserPlus size={16} />
            {isLoading ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>
      ) : null}

      {modo === "recuperar" ? (
        <form onSubmit={handleRecuperar} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email_recuperar" className="block text-sm font-medium text-foreground/80">
              Email
            </label>
            <input
              id="email_recuperar"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="tu@email.com"
              className={inputClass}
            />
          </div>
          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          ) : null}
          {aviso ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {aviso}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Enviando..." : "Enviar link"}
          </button>
          <button
            type="button"
            onClick={() => cambiarModo("login")}
            className="w-full text-center text-sm font-medium text-foreground/60 hover:text-foreground"
          >
            Volver a iniciar sesión
          </button>
        </form>
      ) : null}
    </div>
  );
}
