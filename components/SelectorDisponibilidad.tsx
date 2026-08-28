"use client";

import { useMemo, useState } from "react";
import { Calendar, Check, AlertCircle, Lock } from "lucide-react";
import { BLOQUES_HORARIOS, BLOQUES_HORARIOS_LABELS, type BloqueHorario } from "@/lib/types";
import {
  calcularProximoSabado,
  calcularProximoDomingo,
  formatearFechaCorta,
  puedeModificarDisponibilidad,
  obtenerMensajeDeadline,
  formatearDeadlineCompleto,
} from "@/lib/disponibilidad-deadline";

interface SelectorDisponibilidadProps {
  disponibilidadInicial: BloqueHorario[];
  onGuardar: (disponibilidad: BloqueHorario[]) => Promise<void>;
}

export function SelectorDisponibilidad({
  disponibilidadInicial,
  onGuardar,
}: SelectorDisponibilidadProps) {
  const [seleccionados, setSeleccionados] = useState<Set<BloqueHorario>>(
    new Set(disponibilidadInicial)
  );
  const [guardando, setGuardando] = useState(false);
  const [expandido, setExpandido] = useState(false);

  // Calcular fechas del próximo fin de semana
  const fechas = useMemo(() => {
    const proximoSabado = calcularProximoSabado();
    const proximoDomingo = calcularProximoDomingo();
    
    return {
      sabado: formatearFechaCorta(proximoSabado),
      domingo: formatearFechaCorta(proximoDomingo),
    };
  }, []);

  // Verificar si se puede modificar (deadline)
  const puedeModificar = useMemo(() => puedeModificarDisponibilidad(), []);
  const mensajeDeadline = useMemo(() => obtenerMensajeDeadline(), []);
  const deadlineFormateado = useMemo(() => formatearDeadlineCompleto(), []);

  const toggleBloque = (bloque: BloqueHorario) => {
    if (!puedeModificar) return; // No permitir cambios si pasó el deadline
    
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(bloque)) {
        nuevo.delete(bloque);
      } else {
        nuevo.add(bloque);
      }
      return nuevo;
    });
  };

  const seleccionarTodos = () => {
    if (!puedeModificar) return;
    setSeleccionados(new Set(BLOQUES_HORARIOS));
  };

  const limpiarTodo = () => {
    if (!puedeModificar) return;
    setSeleccionados(new Set());
  };

  const handleGuardar = async () => {
    if (!puedeModificar) return; // Seguridad adicional
    
    setGuardando(true);
    try {
      await onGuardar(Array.from(seleccionados));
      setExpandido(false);
    } finally {
      setGuardando(false);
    }
  };

  const bloquesSabado = BLOQUES_HORARIOS.filter((b) => b.startsWith("sabado_"));
  const bloquesDomingo = BLOQUES_HORARIOS.filter((b) => b.startsWith("domingo_"));
  const sinConfigurar = seleccionados.size === 0;

  return (
    <div
      className={`rounded-2xl border ${
        sinConfigurar
          ? "border-accent/40 bg-accent/5 shadow-[0_0_0_3px_rgba(var(--accent-rgb),0.08)]"
          : "border-border bg-surface"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpandido(!expandido)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-background/30"
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              sinConfigurar ? "bg-accent/15" : "bg-accent/10"
            }`}
          >
            <Calendar size={20} className={sinConfigurar ? "text-accent" : "text-accent/70"} />
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-foreground">
              Mi Disponibilidad Horaria
            </p>
            <div className="mt-1 flex items-center gap-2">
              {sinConfigurar ? (
                <>
                  <AlertCircle size={14} className="text-accent" />
                  <p className="text-xs font-medium text-accent">
                    Declarala para ayudar a programar tus partidos
                  </p>
                </>
              ) : (
                <p className="text-xs text-foreground/60">
                  {seleccionados.size === BLOQUES_HORARIOS.length
                    ? "Disponible en todos los horarios"
                    : `${seleccionados.size} ${seleccionados.size === 1 ? "bloque seleccionado" : "bloques seleccionados"}`}
                </p>
              )}
            </div>
          </div>
        </div>
        <span
          className={`text-sm font-medium transition ${
            sinConfigurar ? "text-accent" : "text-foreground/40"
          } ${expandido ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {expandido ? (
        <div className="border-t border-border px-4 py-4">
          {/* Banner de advertencia si pasó el deadline */}
          {!puedeModificar ? (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3">
              <Lock size={18} className="mt-0.5 shrink-0 text-orange-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-orange-500">
                  Período de modificación cerrado
                </p>
                <p className="mt-1 text-xs text-orange-500/80">
                  {mensajeDeadline}
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={seleccionarTodos}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent hover:text-accent"
              >
                Seleccionar todos
              </button>
              <button
                type="button"
                onClick={limpiarTodo}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent hover:text-accent"
              >
                Limpiar todo
              </button>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/60">
                Sábado {fechas.sabado}
              </p>
              <div className="space-y-1.5">
                {bloquesSabado.map((bloque) => {
                  const activo = seleccionados.has(bloque);
                  return (
                    <button
                      key={bloque}
                      type="button"
                      onClick={() => toggleBloque(bloque)}
                      disabled={!puedeModificar}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                        activo
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-background text-foreground/70 hover:border-foreground/30"
                      } ${!puedeModificar ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                          activo
                            ? "border-accent bg-accent"
                            : "border-foreground/30 bg-background"
                        }`}
                      >
                        {activo ? (
                          <Check size={12} strokeWidth={3} className="text-white" />
                        ) : null}
                      </div>
                      <span className="flex-1 font-medium">
                        {BLOQUES_HORARIOS_LABELS[bloque]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/60">
                Domingo {fechas.domingo}
              </p>
              <div className="space-y-1.5">
                {bloquesDomingo.map((bloque) => {
                  const activo = seleccionados.has(bloque);
                  return (
                    <button
                      key={bloque}
                      type="button"
                      onClick={() => toggleBloque(bloque)}
                      disabled={!puedeModificar}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                        activo
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-background text-foreground/70 hover:border-foreground/30"
                      } ${!puedeModificar ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                          activo
                            ? "border-accent bg-accent"
                            : "border-foreground/30 bg-background"
                        }`}
                      >
                        {activo ? (
                          <Check size={12} strokeWidth={3} className="text-white" />
                        ) : null}
                      </div>
                      <span className="flex-1 font-medium">
                        {BLOQUES_HORARIOS_LABELS[bloque]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setExpandido(false)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGuardar}
              disabled={guardando || !puedeModificar}
              className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar disponibilidad"}
            </button>
          </div>

          <p className="mt-3 text-xs text-foreground/40">
            {puedeModificar ? (
              <>
                <strong>Nota:</strong> El sistema de auto-asignación de horarios usará
                esta información para programar tus partidos solo en los bloques que
                seleccionaste. Si no seleccionás ninguno, se asume que podés jugar en
                cualquier horario. El plazo para modificar cierra el {deadlineFormateado}.
              </>
            ) : (
              <>
                <strong>Nota:</strong> Podrás modificar tu disponibilidad nuevamente después
                del domingo a la noche, para el siguiente fin de semana.
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
