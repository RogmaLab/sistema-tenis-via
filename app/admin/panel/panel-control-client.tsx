"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, LayoutDashboard, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CANCHAS_TORNEO, type Torneo } from "@/lib/types";
import {
  DISPONIBILIDAD_VACIA,
  crearBloqueSiguiente,
  draftDesdeConfig,
  validarDraft,
  ventanasDesdeDraft,
  type BloqueDisponibilidad,
  type DiaFinDeSemana,
  type DisponibilidadDraft,
} from "@/lib/disponibilidad-canchas";
import { fechasProximoFinDeSemana } from "@/lib/auto-asignar-horarios";
import {
  ejecutarAutoAsignacion,
  fetchConfigProgramacion,
  guardarConfigProgramacion,
} from "@/lib/programacion-canchas";
import {
  formatFecha,
  HORAS_PROGRAMACION,
  MINUTOS_PROGRAMACION,
  snapHoraAMediaHora,
} from "@/lib/datetime";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30";

function SelectHoraMinuto({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (hora: string) => void;
}) {
  const normalizada = snapHoraAMediaHora(value);
  const hora = normalizada.slice(0, 2);
  const minuto = normalizada.slice(3, 5) === "30" ? "30" : "00";

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <select
        id={`${id}-hora`}
        value={hora}
        disabled={disabled}
        onChange={(event) => onChange(`${event.target.value}:${minuto}`)}
        className={inputClass}
      >
        {HORAS_PROGRAMACION.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
      <select
        id={`${id}-minuto`}
        value={minuto}
        disabled={disabled}
        onChange={(event) => onChange(`${hora}:${event.target.value}`)}
        className={inputClass}
      >
        {MINUTOS_PROGRAMACION.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PanelControlClient() {
  const supabase = useMemo(() => createClient(), []);
  const [torneos, setTorneos] = useState<Pick<Torneo, "id" | "nombre" | "estado">[]>(
    []
  );
  const [torneoId, setTorneoId] = useState("");
  const [draft, setDraft] = useState<DisponibilidadDraft>(
    structuredClone(DISPONIBILIDAD_VACIA)
  );
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [reasignar, setReasignar] = useState(false);

  const finDeSemana = useMemo(() => fechasProximoFinDeSemana(), []);

  const cargarTorneos = useCallback(async () => {
    const { data, error } = await supabase
      .from("torneos")
      .select("id, nombre, estado")
      .neq("estado", "finalizado")
      .order("fecha_inicio", { ascending: false });
    if (error) {
      toast.error("No se pudieron cargar los torneos.");
      setCargando(false);
      return;
    }
    const lista = data ?? [];
    setTorneos(lista);
    setTorneoId((actual) => actual || lista[0]?.id || "");
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    void cargarTorneos();
  }, [cargarTorneos]);

  useEffect(() => {
    if (!torneoId) {
      setDraft(structuredClone(DISPONIBILIDAD_VACIA));
      return;
    }
    let ignore = false;
    fetchConfigProgramacion(torneoId)
      .then((config) => {
        if (ignore) return;
        setDraft(draftDesdeConfig(config));
      })
      .catch((error: Error) => {
        if (ignore) return;
        toast.error(error.message);
      });
    return () => {
      ignore = true;
    };
  }, [torneoId]);

  async function persistirDisponibilidad() {
    const errorValidacion = validarDraft(draft);
    if (errorValidacion) {
      toast.error(errorValidacion);
      return false;
    }
    await guardarConfigProgramacion({
      torneo_id: torneoId,
      duracion_minutos: draft.duracion_minutos,
      ventanas: ventanasDesdeDraft(draft),
    });
    return true;
  }

  async function handleGuardar() {
    if (!torneoId) return;
    setGuardando(true);
    try {
      const ok = await persistirDisponibilidad();
      if (ok) toast.success("Disponibilidad guardada.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar."
      );
    } finally {
      setGuardando(false);
    }
  }

  async function handleAutoAsignar() {
    if (!torneoId) return;
    setAsignando(true);
    try {
      const ok = await persistirDisponibilidad();
      if (!ok) return;
      const resultado = await ejecutarAutoAsignacion({
        torneoId,
        reasignarProgramados: reasignar,
      });
      if (resultado.asignados === 0) {
        toast.message(
          resultado.sinSlot
            ? `${resultado.sinSlot} partidos no entraron: faltan bloques o hay choques de agenda.`
            : "No había partidos pendientes para asignar (o ya tenían horario)."
        );
        return;
      }
      toast.success(
        `Se programaron ${resultado.asignados} partidos en ${resultado.bloques} bloques.` +
          (resultado.sinSlot
            ? ` ${resultado.sinSlot} quedaron sin horario (faltan canchas o hay choques de agenda).`
            : "")
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo auto-asignar."
      );
    } finally {
      setAsignando(false);
    }
  }

  function actualizarBloque(
    dia: DiaFinDeSemana,
    bloqueId: string,
    cambios: Partial<Omit<BloqueDisponibilidad, "id">>
  ) {
    setDraft((prev) => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        bloques: prev[dia].bloques.map((bloque) =>
          bloque.id === bloqueId ? { ...bloque, ...cambios } : bloque
        ),
      },
    }));
  }

  function toggleCanchaBloque(
    dia: DiaFinDeSemana,
    bloqueId: string,
    cancha: string,
    marcada: boolean
  ) {
    setDraft((prev) => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        bloques: prev[dia].bloques.map((bloque) => {
          if (bloque.id !== bloqueId) return bloque;
          const canchas = marcada
            ? [...bloque.canchas, cancha]
            : bloque.canchas.filter((item) => item !== cancha);
          return { ...bloque, canchas };
        }),
      },
    }));
  }

  function agregarBloque(dia: DiaFinDeSemana) {
    setDraft((prev) => {
      const ultimo = prev[dia].bloques[prev[dia].bloques.length - 1];
      return {
        ...prev,
        [dia]: {
          ...prev[dia],
          bloques: [...prev[dia].bloques, crearBloqueSiguiente(ultimo)],
        },
      };
    });
  }

  function quitarBloque(dia: DiaFinDeSemana, bloqueId: string) {
    setDraft((prev) => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        bloques: prev[dia].bloques.filter((bloque) => bloque.id !== bloqueId),
      },
    }));
  }

  if (cargando) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
        Cargando...
      </p>
    );
  }

  if (torneos.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
        No hay un torneo activo. Creá uno en Torneos para configurar canchas.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <label htmlFor="torneo_panel" className="block text-sm font-medium text-foreground/80">
          Torneo
        </label>
        <select
          id="torneo_panel"
          value={torneoId}
          onChange={(event) => setTorneoId(event.target.value)}
          className={`${inputClass} mt-1.5`}
        >
          {torneos.map((torneo) => (
            <option key={torneo.id} value={torneo.id}>
              {torneo.nombre}
            </option>
          ))}
        </select>
        <p className="mt-3 text-sm text-foreground/50">
          Los tramos se aplican al fin de semana en curso: sábado{" "}
          {formatFecha(finDeSemana.sabado)} y domingo{" "}
          {formatFecha(finDeSemana.domingo)}. Si hay clase en el medio, cargá
          otro tramo. Los horarios ya cargados a mano no se pisan, salvo que
          actives reasignar.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock size={18} className="text-accent" />
          <h2 className="text-base font-semibold text-foreground">
            Disponibilidad de canchas
          </h2>
        </div>

        <div className="mb-5 max-w-xs space-y-1.5">
          <label htmlFor="duracion_bloque" className="block text-sm font-medium text-foreground/80">
            Duración de cada turno
          </label>
          <select
            id="duracion_bloque"
            value={draft.duracion_minutos}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                duracion_minutos: Number(event.target.value) === 60 ? 60 : 90,
              }))
            }
            className={inputClass}
          >
            <option value={90}>90 minutos</option>
            <option value={60}>60 minutos</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(["sabado", "domingo"] as const).map((dia) => {
            const diaDraft = draft[dia];
            const label = dia === "sabado" ? "Sábado" : "Domingo";
            return (
              <div
                key={dia}
                className="rounded-xl border border-border bg-background p-4"
              >
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={diaDraft.activo}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        [dia]: { ...prev[dia], activo: event.target.checked },
                      }))
                    }
                    className="h-4 w-4 accent-accent"
                  />
                  {label}
                </label>

                <div className="mt-3 space-y-3">
                  {diaDraft.bloques.map((bloque, indice) => (
                    <div
                      key={bloque.id}
                      className="rounded-lg border border-border/80 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                          Tramo {indice + 1}
                        </p>
                        <button
                          type="button"
                          disabled={!diaDraft.activo || diaDraft.bloques.length === 1}
                          onClick={() => quitarBloque(dia, bloque.id)}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground/45 transition hover:bg-background hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Quitar tramo ${indice + 1} del ${label}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`${dia}-${bloque.id}-inicio-hora`}
                            className="block text-xs font-medium text-foreground/50"
                          >
                            Desde
                          </label>
                          <SelectHoraMinuto
                            id={`${dia}-${bloque.id}-inicio`}
                            value={bloque.hora_inicio}
                            disabled={!diaDraft.activo}
                            onChange={(hora) =>
                              actualizarBloque(dia, bloque.id, {
                                hora_inicio: hora,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`${dia}-${bloque.id}-fin-hora`}
                            className="block text-xs font-medium text-foreground/50"
                          >
                            Hasta
                          </label>
                          <SelectHoraMinuto
                            id={`${dia}-${bloque.id}-fin`}
                            value={bloque.hora_fin}
                            disabled={!diaDraft.activo}
                            onChange={(hora) =>
                              actualizarBloque(dia, bloque.id, {
                                hora_fin: hora,
                              })
                            }
                          />
                        </div>
                      </div>

                      <p className="mt-3 text-xs font-medium text-foreground/50">
                        Canchas
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {CANCHAS_TORNEO.map((cancha) => {
                          const marcada = bloque.canchas.includes(cancha);
                          return (
                            <label
                              key={cancha}
                              className={`inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-semibold ${
                                marcada && diaDraft.activo
                                  ? "border-accent bg-accent/15 text-accent"
                                  : "border-border text-foreground/55"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                disabled={!diaDraft.activo}
                                checked={marcada}
                                onChange={(event) =>
                                  toggleCanchaBloque(
                                    dia,
                                    bloque.id,
                                    cancha,
                                    event.target.checked
                                  )
                                }
                              />
                              {cancha}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={!diaDraft.activo}
                  onClick={() => agregarBloque(dia)}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm font-medium text-foreground/70 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={16} />
                  Agregar tramo libre
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void handleGuardar()}
          disabled={guardando}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={16} />
          {guardando ? "Guardando..." : "Guardar disponibilidad"}
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <h2 className="text-base font-semibold text-foreground">
            Distribución automática
          </h2>
        </div>
        <p className="text-sm text-foreground/55">
          Toma los partidos pendientes con ambos lados definidos y los
          acomoda solo en los tramos libres. No pisa horarios cargados a mano.
          Después podés ajustar cada cruce desde el cuadro o la clasificación.
        </p>
        <label className="mt-4 flex min-h-11 items-center gap-2 text-sm text-foreground/70">
          <input
            type="checkbox"
            checked={reasignar}
            onChange={(event) => setReasignar(event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Reasignar también los que ya tienen horario (excepto finalizados)
        </label>
        <button
          type="button"
          onClick={() => void handleAutoAsignar()}
          disabled={asignando}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LayoutDashboard size={16} />
          {asignando ? "Asignando..." : "Auto-asignar horarios"}
        </button>
      </section>
    </div>
  );
}
