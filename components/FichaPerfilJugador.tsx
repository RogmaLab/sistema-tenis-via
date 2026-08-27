"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Calendar,
  Crown,
  Lock,
  MapPin,
  Swords,
  Trophy,
  UserRound,
} from "lucide-react";
import { formatFechaCuadro } from "@/lib/datetime";
import { formatPuesto, type PuestoTrofeo } from "@/lib/perfil-jugador";
import type { ResumenPerfil } from "@/lib/perfil-datos";
import {
  CATEGORIAS_JUGADOR,
  GENEROS,
  type CategoriaJugador,
  type Genero,
  type Jugador,
} from "@/lib/types";

export type PestanaPerfil = "datos" | "trofeos" | "config";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/30 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30";

const ESTILO_TROFEO: Record<
  PuestoTrofeo,
  { halo: string; copa: string; etiqueta: string; titulo: string }
> = {
  1: {
    halo: "from-[#eab308]/25 via-[#eab308]/5 to-transparent shadow-[0_0_28px_rgba(234,179,8,0.28)]",
    copa: "text-[#eab308] drop-shadow-[0_0_10px_rgba(234,179,8,0.65)]",
    etiqueta: "bg-[#eab308]/20 text-[#facc15]",
    titulo: "Campeón/a",
  },
  2: {
    halo: "from-[#e5e7eb]/20 via-[#9ca3af]/5 to-transparent shadow-[0_0_22px_rgba(212,212,216,0.18)]",
    copa: "text-[#d1d5db] drop-shadow-[0_0_8px_rgba(209,213,219,0.45)]",
    etiqueta: "bg-white/10 text-[#e5e7eb]",
    titulo: "Finalista",
  },
  3: {
    halo: "from-[#d97706]/25 via-[#d97706]/5 to-transparent shadow-[0_0_22px_rgba(217,119,6,0.22)]",
    copa: "text-[#f59e0b] drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]",
    etiqueta: "bg-[#d97706]/20 text-[#fbbf24]",
    titulo: "3er puesto",
  },
};

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDif(valor: number) {
  if (valor > 0) return `+${valor}`;
  return String(valor);
}

interface FichaPerfilJugadorProps {
  titulo: string;
  subtitulo: string;
  volver?: { href: string; label: string };
  jugador: Jugador;
  resumen: ResumenPerfil | null;
  esPropio: boolean;
  puedeEditarDatos: boolean;
  mostrarWhatsapp: boolean;
  mostrarConfig: boolean;
  pestana: PestanaPerfil;
  onPestana: (pestana: PestanaPerfil) => void;
  onGuardarDatos: (event: FormEvent<HTMLFormElement>) => void;
  guardando: boolean;
  onCambiarClave?: (event: FormEvent<HTMLFormElement>) => void;
  cambiandoClave?: boolean;
  extraCabecera?: ReactNode;
}

export function FichaPerfilJugador({
  titulo,
  subtitulo,
  volver,
  jugador,
  resumen,
  esPropio,
  puedeEditarDatos,
  mostrarWhatsapp,
  mostrarConfig,
  pestana,
  onPestana,
  onGuardarDatos,
  guardando,
  onCambiarClave,
  cambiandoClave = false,
  extraCabecera,
}: FichaPerfilJugadorProps) {
  const pestanas = [
    { id: "datos" as const, label: "Datos Personales", icon: UserRound },
    {
      id: "trofeos" as const,
      label: esPropio ? "Mis Trofeos" : "Trofeos",
      icon: Trophy,
    },
    ...(mostrarConfig
      ? [{ id: "config" as const, label: "Configuración", icon: Lock }]
      : []),
  ];

  const textoRanking = resumen?.posicion
    ? `${formatPuesto(resumen.posicion.puesto)} en el Ranking de ${jugador.categoria}`
    : esPropio
      ? `Todavía no figurás en el ranking de ${jugador.categoria}`
      : `Todavía no figura en el ranking de ${jugador.categoria}`;

  return (
    <div className="space-y-5">
      <header>
        {volver ? (
          <Link
            href={volver.href}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/60 transition hover:text-foreground"
          >
            <ArrowLeft size={16} />
            {volver.label}
          </Link>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {titulo}
        </h1>
        <p className="mt-1 text-sm text-foreground/60">{subtitulo}</p>
        {extraCabecera}
      </header>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="bg-gradient-to-br from-accent/20 via-surface to-surface p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-accent/20 text-lg font-bold text-accent">
              {iniciales(jugador.nombre_completo) || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold text-foreground">
                {jugador.nombre_completo}
              </h2>
              <p className="mt-1 text-sm text-foreground/60">
                {jugador.categoria}
                {jugador.genero ? ` · ${jugador.genero}` : ""}
              </p>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                {resumen?.posicion?.puesto === 1 ? (
                  <Crown size={14} className="shrink-0 text-[#eab308]" />
                ) : null}
                {textoRanking}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border/80 bg-background/50 px-3 py-3 text-center">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground/45">
                Jugados
              </dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-foreground">
                {resumen?.partidosJugados ?? 0}
              </dd>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/50 px-3 py-3 text-center">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground/45">
                Ganados
              </dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-accent">
                {resumen?.partidosGanados ?? 0}
              </dd>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/50 px-3 py-3 text-center">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground/45">
                Dif. games
              </dt>
              <dd
                className={`mt-1 text-xl font-bold tabular-nums ${
                  (resumen?.diferenciaGames ?? 0) > 0
                    ? "text-emerald-400"
                    : (resumen?.diferenciaGames ?? 0) < 0
                      ? "text-foreground/45"
                      : "text-foreground"
                }`}
              >
                {formatDif(resumen?.diferenciaGames ?? 0)}
              </dd>
            </div>
          </dl>
        </div>

        {resumen?.proximoPartido ? (
          <div className="border-t border-border px-5 py-4 sm:px-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">
              Próximo partido
            </p>
            <Link
              href={`/torneos/${resumen.proximoPartido.torneoId}`}
              className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/10 p-3 transition hover:border-accent/50 hover:bg-accent/15"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent">
                <Swords size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  vs {resumen.proximoPartido.rivalNombre}
                </p>
                <p className="mt-0.5 truncate text-xs text-foreground/50">
                  {resumen.proximoPartido.torneoNombre}
                  {" · "}
                  {resumen.proximoPartido.fase}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-foreground/70">
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} />
                    {formatFechaCuadro(resumen.proximoPartido.fecha_programada)}
                  </span>
                  {resumen.proximoPartido.cancha ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} />
                      {resumen.proximoPartido.cancha}
                    </span>
                  ) : null}
                </p>
              </div>
            </Link>
          </div>
        ) : null}
      </section>

      <nav
        className="flex gap-1 rounded-xl border border-border bg-surface p-1"
        aria-label="Secciones del perfil"
      >
        {pestanas.map(({ id, label, icon: Icon }) => {
          const activa = pestana === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPestana(id)}
              className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-[11px] font-semibold transition sm:flex-row sm:gap-2 sm:text-sm ${
                activa
                  ? "bg-accent text-white"
                  : "text-foreground/55 hover:text-foreground"
              }`}
            >
              <Icon size={16} />
              <span className="leading-tight">{label}</span>
            </button>
          );
        })}
      </nav>

      {pestana === "datos" && puedeEditarDatos ? (
        <form
          key={jugador.id}
          onSubmit={onGuardarDatos}
          className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-6"
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
              defaultValue={jugador.nombre_completo}
              className={inputClass}
            />
          </div>

          {mostrarWhatsapp ? (
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
                defaultValue={jugador.whatsapp}
                placeholder="Ej: +54 9 11 1234-5678"
                className={inputClass}
              />
            </div>
          ) : null}

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
              defaultValue={jugador.genero}
              className={inputClass}
            >
              {GENEROS.map((genero: Genero) => (
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
              defaultValue={jugador.categoria}
              className={inputClass}
            >
              {!CATEGORIAS_JUGADOR.includes(
                jugador.categoria as CategoriaJugador
              ) && jugador.categoria ? (
                <option value={jugador.categoria}>{jugador.categoria}</option>
              ) : null}
              {CATEGORIAS_JUGADOR.map((categoria: CategoriaJugador) => (
                <option key={categoria} value={categoria}>
                  {categoria}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      ) : null}

      {pestana === "datos" && !puedeEditarDatos ? (
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <CampoLectura etiqueta="Nombre completo" valor={jugador.nombre_completo} />
          {mostrarWhatsapp ? (
            <CampoLectura etiqueta="WhatsApp" valor={jugador.whatsapp || "—"} />
          ) : null}
          <CampoLectura etiqueta="Género" valor={jugador.genero || "—"} />
          <CampoLectura etiqueta="Categoría" valor={jugador.categoria || "—"} />
        </section>
      ) : null}

      {pestana === "trofeos" ? (
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          {!resumen || resumen.trofeos.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-border text-foreground/25">
                <Trophy size={28} />
              </div>
              <p className="text-base font-semibold text-foreground/80">
                {esPropio
                  ? "Aún no hay copas en la vitrina, ¡a entrenar!"
                  : "Todavía no tiene copas en la vitrina."}
              </p>
              <p className="mt-2 max-w-sm text-sm text-foreground/45">
                Los 1°, 2° y 3° de torneos finalizados aparecen acá.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {resumen.trofeos.map((trofeo) => {
                const estilo = ESTILO_TROFEO[trofeo.puesto];
                return (
                  <li
                    key={`${trofeo.torneoId}-${trofeo.categoria}-${trofeo.puesto}`}
                    className={`rounded-2xl border border-border bg-gradient-to-b ${estilo.halo} p-4`}
                  >
                    <div className="flex items-start gap-3">
                      <Trophy
                        size={trofeo.puesto === 1 ? 36 : 30}
                        className={`mt-0.5 shrink-0 ${estilo.copa}`}
                      />
                      <div className="min-w-0">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${estilo.etiqueta}`}
                        >
                          {formatPuesto(trofeo.puesto)} · {estilo.titulo}
                        </span>
                        <p className="mt-2 font-semibold leading-snug text-foreground">
                          {trofeo.torneoNombre}
                        </p>
                        <p className="mt-1 text-xs text-foreground/50">
                          {trofeo.categoria}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {pestana === "config" && mostrarConfig && onCambiarClave ? (
        <form
          onSubmit={onCambiarClave}
          className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-6"
        >
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Cambiar contraseña
            </h2>
            <p className="mt-1 text-sm text-foreground/50">
              Confirmamos tu clave actual antes de guardar la nueva.
            </p>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="password_actual"
              className="block text-sm font-medium text-foreground/80"
            >
              Contraseña actual
            </label>
            <input
              id="password_actual"
              name="password_actual"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="password_nueva"
              className="block text-sm font-medium text-foreground/80"
            >
              Contraseña nueva
            </label>
            <input
              id="password_nueva"
              name="password_nueva"
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
              Repetir contraseña nueva
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
            disabled={cambiandoClave}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cambiandoClave ? "Actualizando..." : "Actualizar contraseña"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function CampoLectura({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-foreground/40">
        {etiqueta}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{valor}</p>
    </div>
  );
}
