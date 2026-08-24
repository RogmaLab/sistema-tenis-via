"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  SLOT_BYE,
  esSlotBye,
  guardarEdicionClasificacion,
  hayByeVsByeEnDraft,
  inscriptosConPaseDirecto,
  type CruceDraft,
} from "@/lib/motor-torneo";
import type { Jugador } from "@/lib/types";

interface PartidoClasificacionVista {
  id: string;
  jugador_1: { id: string; nombre_completo: string } | null;
  jugador_2: { id: string; nombre_completo: string } | null;
}

interface ModalEditarClasificacionProps {
  torneoId: string;
  categoria: string;
  inscriptos: Jugador[];
  partidos: PartidoClasificacionVista[];
  onCerrar: () => void;
  onGuardado: () => Promise<void>;
}

function slotDesdeJugador(jugador: { id: string } | null | undefined) {
  return jugador?.id ?? SLOT_BYE;
}

function slotSinElegir(slotId: string) {
  return slotId === "";
}

function claseSelect(marcadoRojo: boolean) {
  const base =
    "w-full min-h-9 rounded-md border bg-background px-2 py-1.5 text-xs text-foreground outline-none transition focus:ring-2";
  if (marcadoRojo) {
    return `${base} border-red-500 focus:border-red-500 focus:ring-red-500/30`;
  }
  return `${base} border-border focus:border-accent focus:ring-accent/40`;
}

export function ModalEditarClasificacion({
  torneoId,
  categoria,
  inscriptos,
  partidos,
  onCerrar,
  onGuardado,
}: ModalEditarClasificacionProps) {
  const [draft, setDraft] = useState<CruceDraft[]>(() =>
    partidos.map((partido) => ({
      id: partido.id,
      jugador_1_id: slotDesdeJugador(partido.jugador_1),
      jugador_2_id: slotDesdeJugador(partido.jugador_2),
    }))
  );
  const [isGuardando, setIsGuardando] = useState(false);
  const idsPartidosOriginales = useMemo(
    () => partidos.map((partido) => partido.id),
    [partidos]
  );

  const inscriptosOrdenados = useMemo(
    () =>
      [...inscriptos].sort((a, b) =>
        a.nombre_completo.localeCompare(b.nombre_completo, "es")
      ),
    [inscriptos]
  );

  const hayAutocruz = draft.some(
    (cruce) =>
      cruce.jugador_1_id === cruce.jugador_2_id &&
      !esSlotBye(cruce.jugador_1_id)
  );
  const hayByeVsBye = hayByeVsByeEnDraft(draft);
  const haySlotsVacios = draft.some(
    (cruce) =>
      slotSinElegir(cruce.jugador_1_id) || slotSinElegir(cruce.jugador_2_id)
  );
  const hayError = hayAutocruz || hayByeVsBye || haySlotsVacios;
  const sinPartido = inscriptosConPaseDirecto(inscriptos, draft);

  function slotMarcadoRojo(cruce: CruceDraft, slotId: string) {
    if (slotSinElegir(slotId)) return true;
    if (esSlotBye(slotId)) {
      return esSlotBye(cruce.jugador_1_id) && esSlotBye(cruce.jugador_2_id);
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

  function handleAgregarPartido() {
    setDraft((previos) => [
      ...previos,
      {
        id: `nuevo-${crypto.randomUUID()}`,
        jugador_1_id: "",
        jugador_2_id: "",
      },
    ]);
  }

  function handleEliminarCruce(cruceId: string) {
    setDraft((previos) => previos.filter((cruce) => cruce.id !== cruceId));
  }

  async function handleGuardar() {
    if (hayError) {
      toast.error("Completá los cruces en rojo antes de guardar.");
      return;
    }

    setIsGuardando(true);
    try {
      await guardarEdicionClasificacion({
        torneoId,
        categoria,
        idsJugadoresCategoria: inscriptos.map((jugador) => jugador.id),
        idsPartidosActuales: idsPartidosOriginales,
        cruces: draft.map((cruce) => ({
          id: cruce.id.startsWith("nuevo-") ? null : cruce.id,
          jugador_1_id: cruce.jugador_1_id,
          jugador_2_id: cruce.jugador_2_id,
        })),
      });
      toast.success("Cruces de clasificación actualizados.");
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
      <option value="">Elegí un jugador</option>
      <option value={SLOT_BYE}>--- BYE (Pase Libre) ---</option>
      {inscriptosOrdenados.map((jugador) => (
        <option key={jugador.id} value={jugador.id}>
          {jugador.nombre_completo}
        </option>
      ))}
    </>
  );

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
              Editar cruces de clasificación
            </h2>
            <p className="mt-1 text-sm text-foreground/50">
              {inscriptos.length} inscriptos. Usá{" "}
              <span className="font-medium text-foreground/70">
                BYE (Pase Libre)
              </span>{" "}
              para números impares: el jugador real avanza por W.O. automático.
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
              {haySlotsVacios
                ? "Cada partido necesita dos asientos: jugador o BYE."
                : hayByeVsBye
                  ? "No puede haber un cruce BYE vs BYE."
                  : "Hay un partido con el mismo jugador en ambos lados."}
            </p>
          )}

          {draft.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-foreground/50">
              No hay partidos. Agregá cruces para la Qualy.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {draft.map((cruce, indice) => (
                <li
                  key={cruce.id}
                  className="rounded-xl border border-border bg-background p-2.5"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                      Partido {indice + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleEliminarCruce(cruce.id)}
                      aria-label={`Eliminar partido ${indice + 1}`}
                      className="inline-flex items-center justify-center rounded-md p-1 text-red-500/70 transition hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
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
                      {opciones}
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
                      {opciones}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={handleAgregarPartido}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
          >
            <Plus size={16} />
            Agregar Partido
          </button>

          <div className="rounded-xl border border-border bg-background px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/40">
              Todavía sin partido ({sinPartido.length})
            </p>
            {sinPartido.length === 0 ? (
              <p className="mt-1 text-sm text-foreground/50">
                Todos los inscriptos están en al menos un cruce.
              </p>
            ) : (
              <p className="mt-1 text-sm text-foreground/70">
                {sinPartido.map((jugador) => jugador.nombre_completo).join(", ")}
                . Podés emparejarlos con otro jugador o con BYE (pase directo).
              </p>
            )}
          </div>
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
            {isGuardando ? "Guardando..." : "Guardar cruces"}
          </button>
        </div>
      </div>
    </div>
  );
}
