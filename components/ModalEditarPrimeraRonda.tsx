"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  SLOT_BYE,
  esSlotBye,
  guardarEdicionPrimeraRonda,
  type OpcionesCuadroManual,
} from "@/lib/motor-torneo";
import { useAuth } from "@/components/auth-provider";

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
  opciones: OpcionesCuadroManual;
  idsRondasPosteriores: string[];
  onCerrar: () => void;
  onGuardado: () => Promise<void>;
}

function slotDesdeJugador(jugador: { id: string } | null | undefined) {
  return jugador?.id ?? SLOT_BYE;
}

function slotParaGuardar(slotId: string): string | null {
  if (!slotId || esSlotBye(slotId)) return null;
  return slotId;
}

function claseSelect(marcadoRojo: boolean) {
  const base =
    "w-full min-h-9 rounded-md border bg-background px-2 py-1.5 text-xs text-foreground outline-none transition focus:ring-2";
  if (marcadoRojo) {
    return `${base} border-red-500 focus:border-red-500 focus:ring-red-500/30`;
  }
  return `${base} border-border focus:border-accent focus:ring-accent/40`;
}

function OpcionesSelect({ opciones }: { opciones: OpcionesCuadroManual }) {
  const idsVistos = new Set<string>();

  const optgroup = (
    label: string,
    items: { id: string; label: string }[]
  ) => {
    const unicos = items.filter((item) => {
      if (idsVistos.has(item.id)) return false;
      idsVistos.add(item.id);
      return true;
    });
    if (unicos.length === 0) return null;
    return (
      <optgroup label={label}>
        {unicos.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </optgroup>
    );
  };

  return (
    <>
      <option value={SLOT_BYE}>--- BYE (Pase Libre) ---</option>
      {optgroup("Ganadores Qualy", opciones.ganadoresQualy)}
      {optgroup("Perdedores Qualy (Lucky Loser)", opciones.perdedoresQualy)}
      {optgroup("Pases directos", opciones.pasesDirectos)}
      {optgroup("Otros", opciones.otros)}
    </>
  );
}

export function ModalEditarPrimeraRonda({
  fase,
  partidos,
  opciones,
  idsRondasPosteriores,
  onCerrar,
  onGuardado,
}: ModalEditarPrimeraRondaProps) {
  const { isAdmin } = useAuth();
  const [draft, setDraft] = useState<SlotDraft[]>(() =>
    partidos.map((partido) => ({
      id: partido.id,
      jugador_1_id: slotDesdeJugador(partido.jugador_1),
      jugador_2_id: slotDesdeJugador(partido.jugador_2),
      siguiente_partido_id: partido.siguiente_partido_id,
    }))
  );
  const [isGuardando, setIsGuardando] = useState(false);

  const hayAutocruz = useMemo(
    () =>
      draft.some(
        (cruce) =>
          !esSlotBye(cruce.jugador_1_id) &&
          !esSlotBye(cruce.jugador_2_id) &&
          cruce.jugador_1_id === cruce.jugador_2_id
      ),
    [draft]
  );

  const hayByeVsBye = useMemo(
    () =>
      draft.some(
        (cruce) =>
          esSlotBye(cruce.jugador_1_id) && esSlotBye(cruce.jugador_2_id)
      ),
    [draft]
  );

  const hayError = hayAutocruz || hayByeVsBye;

  function slotMarcadoRojo(cruce: SlotDraft, slotId: string) {
    if (esSlotBye(slotId)) {
      const otro =
        slotId === cruce.jugador_1_id
          ? cruce.jugador_2_id
          : cruce.jugador_1_id;
      return esSlotBye(otro);
    }
    return cruce.jugador_1_id === cruce.jugador_2_id;
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
    if (!isAdmin) return;
    if (hayError) {
      toast.error("Corregí los cruces en rojo antes de guardar.");
      return;
    }

    setIsGuardando(true);
    try {
      await guardarEdicionPrimeraRonda({
        cruces: draft.map((cruce) => ({
          id: cruce.id,
          jugador_1_id: slotParaGuardar(cruce.jugador_1_id),
          jugador_2_id: slotParaGuardar(cruce.jugador_2_id),
          siguiente_partido_id: cruce.siguiente_partido_id,
        })),
        idsRondasPosteriores,
      });
      toast.success("Cuadro actualizado.");
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-6 pt-6 sm:px-8 sm:pt-8">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Editar cuadro
            </h2>
            <p className="mt-1 text-sm text-foreground/50">
              {fase}: intercambiá jugadores (G, L o pases directos) o asigná{" "}
              <span className="font-medium text-foreground/70">
                BYE (Pase Libre)
              </span>{" "}
              para un seeding estilo Excel.
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
                : "No puede haber un cruce BYE vs BYE."}
            </p>
          )}

          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {draft.map((cruce, indice) => (
              <li
                key={cruce.id}
                className="rounded-xl border border-border bg-background p-2.5"
              >
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                  {fase} {indice + 1}
                </p>
                <div className="flex flex-col gap-1">
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
                    aria-label={`Jugador 1 del partido ${indice + 1}`}
                  >
                    <OpcionesSelect opciones={opciones} />
                  </select>
                  <p className="py-0 text-center text-[10px] font-medium uppercase tracking-widest text-foreground/30">
                    vs
                  </p>
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
                    aria-label={`Jugador 2 del partido ${indice + 1}`}
                  >
                    <OpcionesSelect opciones={opciones} />
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
            {isGuardando ? "Guardando..." : "Guardar cuadro"}
          </button>
        </div>
      </div>
    </div>
  );
}
