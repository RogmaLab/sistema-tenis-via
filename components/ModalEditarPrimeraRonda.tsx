"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SLOT_BYE, esSlotBye, guardarEdicionPrimeraRonda } from "@/lib/motor-torneo";

interface JugadorOpcion {
  id: string;
  nombre_completo: string;
}

interface PartidoPrimeraRonda {
  id: string;
  jugador_1: { id: string; nombre_completo: string } | null;
  jugador_2: { id: string; nombre_completo: string } | null;
  siguiente_partido_id: string | null;
}

interface SlotDraft {
  id: string;
  jugador_1_id: string;
  jugador_2_id: string;
  siguiente_partido_id: string | null;
}

interface ModalEditarPrimeraRondaProps {
  fase: string;
  partidos: PartidoPrimeraRonda[];
  jugadoresElegibles: JugadorOpcion[];
  idsRondasPosteriores: string[];
  onCerrar: () => void;
  onGuardado: () => Promise<void>;
}

function slotDesdeJugador(
  jugador: { id: string } | null | undefined
) {
  return jugador?.id ?? SLOT_BYE;
}

function claseSelect(marcadoRojo: boolean) {
  const base =
    "w-full min-h-11 rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2";
  if (marcadoRojo) {
    return `${base} border-red-500 focus:border-red-500 focus:ring-red-500/30`;
  }
  return `${base} border-border focus:border-accent focus:ring-accent/40`;
}

export function ModalEditarPrimeraRonda({
  fase,
  partidos,
  jugadoresElegibles,
  idsRondasPosteriores,
  onCerrar,
  onGuardado,
}: ModalEditarPrimeraRondaProps) {
  const [draft, setDraft] = useState<SlotDraft[]>(() =>
    partidos.map((partido) => ({
      id: partido.id,
      jugador_1_id: slotDesdeJugador(partido.jugador_1),
      jugador_2_id: slotDesdeJugador(partido.jugador_2),
      siguiente_partido_id: partido.siguiente_partido_id,
    }))
  );
  const [isGuardando, setIsGuardando] = useState(false);

  const jugadoresOrdenados = useMemo(
    () =>
      [...jugadoresElegibles].sort((a, b) =>
        a.nombre_completo.localeCompare(b.nombre_completo, "es")
      ),
    [jugadoresElegibles]
  );

  const idsDuplicados = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const cruce of draft) {
      for (const slot of [cruce.jugador_1_id, cruce.jugador_2_id]) {
        if (esSlotBye(slot)) continue;
        conteo.set(slot, (conteo.get(slot) ?? 0) + 1);
      }
    }
    return new Set(
      [...conteo.entries()]
        .filter(([, cantidad]) => cantidad > 1)
        .map(([id]) => id)
    );
  }, [draft]);

  const hayAutocruz = draft.some(
    (cruce) =>
      cruce.jugador_1_id === cruce.jugador_2_id &&
      !esSlotBye(cruce.jugador_1_id)
  );
  const hayByeVsBye = draft.some(
    (cruce) =>
      esSlotBye(cruce.jugador_1_id) && esSlotBye(cruce.jugador_2_id)
  );
  const hayError = hayAutocruz || hayByeVsBye || idsDuplicados.size > 0;

  function slotMarcadoRojo(cruce: SlotDraft, slotId: string) {
    if (esSlotBye(slotId)) {
      return esSlotBye(cruce.jugador_1_id) && esSlotBye(cruce.jugador_2_id);
    }
    if (cruce.jugador_1_id === cruce.jugador_2_id) return true;
    return idsDuplicados.has(slotId);
  }

  function handleCambiarSlot(
    cruceId: string,
    slot: "jugador_1_id" | "jugador_2_id",
    valor: string
  ) {
    setDraft((previos) =>
      previos.map((cruce) =>
        cruce.id === cruceId ? { ...cruce, [slot]: valor } : cruce
      )
    );
  }

  async function handleGuardar() {
    if (hayError) {
      toast.error("Corregí los cruces en rojo antes de guardar.");
      return;
    }

    setIsGuardando(true);
    try {
      await guardarEdicionPrimeraRonda({
        cruces: draft.map((cruce) => ({
          id: cruce.id,
          jugador_1_id: esSlotBye(cruce.jugador_1_id)
            ? null
            : cruce.jugador_1_id,
          jugador_2_id: esSlotBye(cruce.jugador_2_id)
            ? null
            : cruce.jugador_2_id,
          siguiente_partido_id: cruce.siguiente_partido_id,
        })),
        idsRondasPosteriores,
      });
      toast.success("Cruces del cuadro actualizados.");
      await onGuardado();
      onCerrar();
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los cruces.";
      toast.error(mensaje);
    } finally {
      setIsGuardando(false);
    }
  }

  const opciones = (
    <>
      {jugadoresOrdenados.map((jugador) => (
        <option key={jugador.id} value={jugador.id}>
          {jugador.nombre_completo}
        </option>
      ))}
      <option value={SLOT_BYE}>BYE</option>
    </>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-6 pt-6 sm:px-8 sm:pt-8">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Editar cruces de {fase}
            </h2>
            <p className="mt-1 text-sm text-foreground/50">
              Ajustá bajas o intercambios. Un jugador no puede repetirse en el
              mismo partido.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="ml-3 text-foreground/50 transition hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5 sm:px-8">
          {hayError && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {hayAutocruz
                ? "Hay un partido con el mismo jugador en ambos lados."
                : hayByeVsBye
                  ? "Hay un cruce BYE vs BYE."
                  : "Hay jugadores asignados a más de un cruce."}
            </p>
          )}

          <ul className="space-y-3">
            {draft.map((cruce, indice) => (
              <li
                key={cruce.id}
                className="rounded-2xl border border-border bg-background p-4"
              >
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">
                  {fase} {indice + 1}
                </p>
                <div className="flex flex-col gap-2">
                  <select
                    value={cruce.jugador_1_id}
                    onChange={(event) =>
                      handleCambiarSlot(
                        cruce.id,
                        "jugador_1_id",
                        event.target.value
                      )
                    }
                    className={claseSelect(
                      slotMarcadoRojo(cruce, cruce.jugador_1_id)
                    )}
                    aria-label={`Jugador 1 del cruce ${indice + 1}`}
                  >
                    {opciones}
                  </select>
                  <p className="text-center text-xs text-foreground/40">vs</p>
                  <select
                    value={cruce.jugador_2_id}
                    onChange={(event) =>
                      handleCambiarSlot(
                        cruce.id,
                        "jugador_2_id",
                        event.target.value
                      )
                    }
                    className={claseSelect(
                      slotMarcadoRojo(cruce, cruce.jugador_2_id)
                    )}
                    aria-label={`Jugador 2 del cruce ${indice + 1}`}
                  >
                    {opciones}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex shrink-0 gap-3 border-t border-border px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={onCerrar}
            disabled={isGuardando}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={isGuardando || hayError}
            className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGuardando ? "Guardando..." : "Guardar Cambios del Cuadro"}
          </button>
        </div>
      </div>
    </div>
  );
}
