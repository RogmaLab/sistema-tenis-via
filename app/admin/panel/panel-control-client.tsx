"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  LayoutDashboard,
  Lock,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
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
  fetchTorneosConConfiguracion,
  guardarConfigProgramacion,
  habilitarDisponibilidadJugadores,
} from "@/lib/programacion-canchas";
import {
  formatFecha,
  HORAS_PROGRAMACION,
  MINUTOS_PROGRAMACION,
  snapHoraAMediaHora,
} from "@/lib/datetime";
import {
  calcularProximoSabado,
  calcularProximoDomingo,
  formatearFechaCorta,
} from "@/lib/disponibilidad-deadline";
import { InscripcionesPendientesTab } from "./inscripciones-pendientes";

type Pestana = "disponibilidad" | "inscripciones";

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
  const [pestana, setPestana] = useState<Pestana>("disponibilidad");
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
  const [disponibilidadAbierta, setDisponibilidadAbierta] = useState(false);
  const [disponibilidadHabilitadaAt, setDisponibilidadHabilitadaAt] = useState<
    string | null
  >(null);
  const [torneosConConfig, setTorneosConConfig] = useState<
    Array<{ id: string; nombre: string }>
  >([]);
  const [reutilizarTorneoId, setReutilizarTorneoId] = useState("");
  const [habilitando, setHabilitando] = useState(false);

  const finDeSemana = useMemo(() => fechasProximoFinDeSemana(), []);

  const fechasFormateadas = useMemo(() => {
    const sabado = calcularProximoSabado();
    const domingo = calcularProximoDomingo();
    return {
      sabado: formatearFechaCorta(sabado),
      domingo: formatearFechaCorta(domingo),
    };
  }, []);

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
      setDisponibilidadAbierta(false);
      setDisponibilidadHabilitadaAt(null);
      return;
    }
    let ignore = false;
    fetchConfigProgramacion(torneoId)
      .then((config) => {
        if (ignore) return;
        setDraft(draftDesdeConfig(config));
        setDisponibilidadAbierta(config?.disponibilidad_abierta ?? false);
        setDisponibilidadHabilitadaAt(
          config?.disponibilidad_habilitada_at ?? null
        );
      })
      .catch((error: Error) => {
        if (ignore) return;
        toast.error(error.message);
      });
    return () => {
      ignore = true;
    };
  }, [torneoId]);

  useEffect(() => {
    if (!torneoId) {
      setTorneosConConfig([]);
      return;
    }
    let ignore = false;
    fetchTorneosConConfiguracion(torneoId)
      .then((lista) => {
        if (ignore) return;
        setTorneosConConfig(lista);
        setReutilizarTorneoId("");
      })
      .catch(() => {
        if (ignore) return;
        setTorneosConConfig([]);
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
    await guardarConfigProgramacion(
      {
        torneo_id: torneoId,
        duracion_minutos: draft.duracion_minutos,
        ventanas: ventanasDesdeDraft(draft),
      },
      { preservarEstadoApertura: true }
    );
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

  async function handleHabilitarDisponibilidad() {
    if (!torneoId) return;
    const errorValidacion = validarDraft(draft);
    if (errorValidacion) {
      toast.error(errorValidacion);
      return;
    }
    setHabilitando(true);
    try {
      const config = {
        torneo_id: torneoId,
        duracion_minutos: draft.duracion_minutos,
        ventanas: ventanasDesdeDraft(draft),
      };
      await habilitarDisponibilidadJugadores(config);
      setDisponibilidadAbierta(true);
      setDisponibilidadHabilitadaAt(new Date().toISOString());
      toast.success(
        "Disponibilidad confirmada. Los jugadores ya pueden cargar sus horarios."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo habilitar la disponibilidad."
      );
    } finally {
      setHabilitando(false);
    }
  }

  async function handleReutilizarConfig() {
    if (!reutilizarTorneoId) return;
    try {
      const config = await fetchConfigProgramacion(reutilizarTorneoId);
      if (!config) {
        toast.error("Ese torneo no tiene configuración guardada.");
        return;
      }
      setDraft(draftDesdeConfig(config));
      toast.success("Configuración copiada. Revisá los tramos y confirmá.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo copiar la configuración."
      );
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

      let mensaje = `✅ ${resultado.asignados} ${resultado.asignados === 1 ? "partido asignado" : "partidos asignados"}`;
      
      if (resultado.sinSlot > 0) {
        mensaje += `\n⚠️ ${resultado.sinSlot} ${resultado.sinSlot === 1 ? "partido quedó" : "partidos quedaron"} sin slot libre`;
      }
      
      if (resultado.sinDisponibilidad > 0) {
        mensaje += `\n❌ ${resultado.sinDisponibilidad} ${resultado.sinDisponibilidad === 1 ? "partido requiere" : "partidos requieren"} intervención manual (sin disponibilidad común)`;
      }

      if (resultado.asignados === 0 && resultado.sinSlot === 0 && resultado.sinDisponibilidad === 0) {
        toast.message("No había partidos pendientes para asignar (o ya tenían horario).");
        return;
      }

      if (resultado.partidosSinDisponibilidad.length > 0) {
        console.log("Partidos sin disponibilidad común:", resultado.partidosSinDisponibilidad);
      }

      toast.success(mensaje, { duration: 6000 });
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

  return (
    <div className="space-y-6">
      {/* Pestañas de navegación */}
      <div className="flex gap-2 rounded-2xl border border-border bg-surface p-1">
        <button
          onClick={() => setPestana("disponibilidad")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            pestana === "disponibilidad"
              ? "bg-accent text-white"
              : "text-foreground/70 hover:bg-background"
          }`}
        >
          <CalendarClock size={16} />
          Disponibilidad de Canchas
        </button>
        <button
          onClick={() => setPestana("inscripciones")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            pestana === "inscripciones"
              ? "bg-accent text-white"
              : "text-foreground/70 hover:bg-background"
          }`}
        >
          <Clock size={16} />
          Inscripciones Pendientes
        </button>
      </div>

      {/* Contenido de Inscripciones Pendientes */}
      {pestana === "inscripciones" ? (
        <InscripcionesPendientesTab />
      ) : null}

      {/* Contenido de Disponibilidad de Canchas */}
      {pestana === "disponibilidad" && torneos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
          No hay un torneo activo. Creá uno en Torneos para configurar canchas.
        </p>
      ) : null}

      {pestana === "disponibilidad" && torneos.length > 0 ? (
        <>
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

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {disponibilidadAbierta ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
              <CheckCircle2 size={14} />
              Abierta para jugadores
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-400">
              <Lock size={14} />
              Cerrada — los jugadores aún no pueden cargar horarios
            </span>
          )}
          {disponibilidadHabilitadaAt ? (
            <span className="text-xs text-foreground/45">
              Habilitada el{" "}
              {new Date(disponibilidadHabilitadaAt).toLocaleString("es-AR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
        </div>

        {torneosConConfig.length > 0 ? (
          <div className="mt-4 rounded-xl border border-border/80 bg-background p-4">
            <div className="flex items-center gap-2">
              <Copy size={16} className="text-accent" />
              <p className="text-sm font-semibold text-foreground">
                Reutilizar configuración anterior
              </p>
            </div>
            <p className="mt-1 text-xs text-foreground/50">
              Copiá tramos y canchas de un fin de semana previo para ahorrar
              tiempo.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                value={reutilizarTorneoId}
                onChange={(event) => setReutilizarTorneoId(event.target.value)}
                className={`${inputClass} sm:flex-1`}
              >
                <option value="">Elegir torneo...</option>
                {torneosConConfig.map((torneo) => (
                  <option key={torneo.id} value={torneo.id}>
                    {torneo.nombre}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!reutilizarTorneoId}
                onClick={() => void handleReutilizarConfig()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy size={16} />
                Copiar
              </button>
            </div>
          </div>
        ) : null}
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
            const labelBase = dia === "sabado" ? "Sábado" : "Domingo";
            const fecha = dia === "sabado" ? fechasFormateadas.sabado : fechasFormateadas.domingo;
            const label = `${labelBase} ${fecha}`;
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
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={16} />
          {guardando ? "Guardando..." : "Guardar borrador (solo admin)"}
        </button>

        <div className="mt-6 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-semibold text-foreground">
            Publicar para jugadores
          </p>
          <p className="mt-1 text-xs text-foreground/55">
            Cuando confirmes las canchas y horarios del fin de semana, los
            jugadores podrán marcar en qué bloques pueden jugar. Guardar
            borrador no abre la carga para ellos.
          </p>
          <button
            type="button"
            onClick={() => void handleHabilitarDisponibilidad()}
            disabled={habilitando}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <CheckCircle2 size={16} />
            {habilitando
              ? "Habilitando..."
              : "Confirmar y Habilitar Disponibilidad para Jugadores"}
          </button>
        </div>
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
        </>
      ) : null}
    </div>
  );
}
