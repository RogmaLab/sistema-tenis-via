"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Shuffle } from "lucide-react";
import { toast } from "sonner";
import {
  SLOT_BYE,
  esSlotBye,
  guardarCrucesDesdeDraft,
  hayByeVsByeEnDraft,
  idsDuplicadosEnDraft,
  potenciaDeDosSuperior,
  sortearCrucesDraft,
  type CruceDraft,
} from "@/lib/motor-torneo";
import type { Jugador } from "@/lib/types";

interface PartidoClasificacionVista {
  id: string;
  resultado: string | null;
  estado: string;
  ganador_id: string | null;
  jugador_1: { id: string; nombre_completo: string } | null;
  jugador_2: { id: string; nombre_completo: string } | null;
}

interface FaseClasificacionTabProps {
  torneoId: string;
  categoriaLabel: string;
  isAdmin: boolean;
  isLoadingPartidos: boolean;
  inscriptos: Jugador[];
  partidosClasificacion: PartidoClasificacionVista[];
  crucesDraft: CruceDraft[];
  setCrucesDraft: Dispatch<SetStateAction<CruceDraft[]>>;
  onGuardados: () => Promise<void>;
}

function etiquetaSlot(slotId: string, inscriptos: Jugador[]) {
  if (esSlotBye(slotId)) return "BYE";
  return (
    inscriptos.find((jugador) => jugador.id === slotId)?.nombre_completo ??
    "Sin asignar"
  );
}

function claseSelect(marcadoRojo: boolean, fijado: boolean) {
  const base =
    "w-full min-h-11 rounded-lg border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-accent/40";
  if (fijado) {
    return `${base} cursor-default border-border text-foreground`;
  }
  if (marcadoRojo) {
    return `${base} border-red-500 text-foreground focus:border-red-500 focus:ring-red-500/30`;
  }
  return `${base} border-border text-foreground focus:border-accent`;
}

export function FaseClasificacionTab({
  torneoId,
  categoriaLabel,
  isAdmin,
  isLoadingPartidos,
  inscriptos,
  partidosClasificacion,
  crucesDraft,
  setCrucesDraft,
  onGuardados,
}: FaseClasificacionTabProps) {
  const [vistaFijada, setVistaFijada] = useState(false);
  const [isConfirmando, setIsConfirmando] = useState(false);

  const inscriptosOrdenados = useMemo(
    () =>
      [...inscriptos].sort((a, b) =>
        a.nombre_completo.localeCompare(b.nombre_completo, "es")
      ),
    [inscriptos]
  );

  const duplicados = useMemo(
    () => idsDuplicadosEnDraft(crucesDraft),
    [crucesDraft]
  );
  const byeVsBye = hayByeVsByeEnDraft(crucesDraft);
  const potencia = potenciaDeDosSuperior(Math.max(inscriptos.length, 2));
  const cantidadByes = Math.max(0, potencia - inscriptos.length);

  const partidosGuardados = partidosClasificacion.length > 0;
  const mostrarFijado = partidosGuardados || vistaFijada;

  function handleSortear() {
    if (inscriptos.length < 2) {
      toast.error("Se necesitan al menos 2 inscriptos en esta categoría.");
      return;
    }
    try {
      setCrucesDraft(sortearCrucesDraft(inscriptos));
      setVistaFijada(false);
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "No se pudieron sortear los cruces.";
      toast.error(mensaje);
    }
  }

  function handleVolverASortear() {
    handleSortear();
  }

  function handleCambiarSlot(
    cruceId: string,
    slot: "jugador_1_id" | "jugador_2_id",
    valor: string
  ) {
    setCrucesDraft((previos) =>
      previos.map((cruce) =>
        cruce.id === cruceId ? { ...cruce, [slot]: valor } : cruce
      )
    );
  }

  async function handleConfirmar() {
    if (duplicados.size > 0) {
      toast.error("Hay jugadores repetidos en más de un cruce.");
      return;
    }
    if (byeVsBye) {
      toast.error("No se puede confirmar un cruce BYE vs BYE.");
      return;
    }

    setIsConfirmando(true);
    try {
      const resultado = await guardarCrucesDesdeDraft(
        torneoId,
        inscriptos,
        crucesDraft
      );
      setVistaFijada(true);
      toast.success(
        `Se guardaron ${resultado.partidosCreados} cruces de clasificación.`
      );
      await onGuardados();
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los cruces.";
      toast.error(mensaje);
    } finally {
      setIsConfirmando(false);
    }
  }

  function slotMarcadoRojo(slotId: string, cruce: CruceDraft) {
    if (esSlotBye(slotId)) {
      return (
        byeVsBye &&
        esSlotBye(cruce.jugador_1_id) &&
        esSlotBye(cruce.jugador_2_id)
      );
    }
    return duplicados.has(slotId);
  }

  if (isLoadingPartidos) {
    return (
      <section className="rounded-2xl border border-border bg-surface px-6 py-16 text-center">
        <p className="text-sm text-foreground/50">Cargando...</p>
      </section>
    );
  }

  if (mostrarFijado) {
    const crucesFijos = partidosGuardados
      ? partidosClasificacion.map((partido) => ({
          id: partido.id,
          etiqueta1: partido.jugador_1?.nombre_completo ?? "BYE",
          etiqueta2: partido.jugador_2?.nombre_completo ?? "BYE",
          ganadorId: partido.ganador_id,
          id1: partido.jugador_1?.id ?? null,
          id2: partido.jugador_2?.id ?? null,
          resultado: partido.resultado,
        }))
      : crucesDraft.map((cruce) => ({
          id: cruce.id,
          etiqueta1: etiquetaSlot(cruce.jugador_1_id, inscriptos),
          etiqueta2: etiquetaSlot(cruce.jugador_2_id, inscriptos),
          ganadorId: null as string | null,
          id1: esSlotBye(cruce.jugador_1_id) ? null : cruce.jugador_1_id,
          id2: esSlotBye(cruce.jugador_2_id) ? null : cruce.jugador_2_id,
          resultado: null as string | null,
        }));

    return (
      <section>
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Cruces de clasificación
          </h2>
          <p className="mt-1 text-sm text-foreground/50">
            {categoriaLabel} · vista confirmada
          </p>
        </header>
        <ul className="space-y-3">
          {crucesFijos.map((cruce, indice) => (
            <li
              key={cruce.id}
              className="rounded-2xl border border-border bg-surface p-4"
            >
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">
                Cruce {indice + 1}
                {cruce.resultado === "W.O." ? " · W.O." : ""}
              </p>
              <div className="flex flex-col gap-2">
                <p
                  className={`rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium ${
                    cruce.ganadorId && cruce.ganadorId === cruce.id1
                      ? "text-accent"
                      : "text-foreground"
                  }`}
                >
                  {cruce.etiqueta1}
                </p>
                <p className="text-center text-xs text-foreground/40">vs</p>
                <p
                  className={`rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium ${
                    cruce.ganadorId && cruce.ganadorId === cruce.id2
                      ? "text-accent"
                      : "text-foreground"
                  }`}
                >
                  {cruce.etiqueta2}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (crucesDraft.length === 0) {
    return (
      <section className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="text-base font-semibold text-foreground/70">
          Todavía no hay cruces sorteados
        </p>
        <p className="mt-2 max-w-sm text-sm text-foreground/40">
          Clasificación de {categoriaLabel}. El sorteo completa el cuadro a{" "}
          {potencia} asientos
          {cantidadByes > 0
            ? ` e inyecta ${cantidadByes} BYE${cantidadByes === 1 ? "" : "s"}`
            : ""}
          .
        </p>
        {inscriptos.length < 2 ? (
          <p className="mt-4 text-sm text-foreground/40">
            Se necesitan al menos 2 inscriptos en esta categoría.
          </p>
        ) : isAdmin ? (
          <button
            type="button"
            onClick={handleSortear}
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98]"
          >
            <Shuffle size={16} />
            Sortear Cruces Aleatorios
          </button>
        ) : (
          <p className="mt-4 text-sm text-foreground/40">
            El administrador todavía no sorteó esta categoría.
          </p>
        )}
      </section>
    );
  }

  const opciones = (
    <>
      {inscriptosOrdenados.map((jugador) => (
        <option key={jugador.id} value={jugador.id}>
          {jugador.nombre_completo}
        </option>
      ))}
      <option value={SLOT_BYE}>BYE</option>
    </>
  );

  return (
    <section>
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Borrador de cruces
        </h2>
        <p className="mt-1 text-sm text-foreground/50">
          {categoriaLabel}. Podés intercambiar jugadores o asignar el BYE al
          cabeza de serie.
        </p>
      </header>

      {(duplicados.size > 0 || byeVsBye) && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {duplicados.size > 0
            ? "Hay jugadores seleccionados en más de un cruce. El borde rojo marca los duplicados."
            : "Hay un cruce BYE vs BYE. Cambiá uno de los asientos."}
        </p>
      )}

      <ul className="space-y-3">
        {crucesDraft.map((cruce, indice) => (
          <li
            key={cruce.id}
            className="rounded-2xl border border-border bg-surface p-4"
          >
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">
              Cruce {indice + 1}
            </p>
            <div className="flex flex-col gap-2">
              <select
                value={cruce.jugador_1_id}
                disabled={!isAdmin}
                onChange={(event) =>
                  handleCambiarSlot(
                    cruce.id,
                    "jugador_1_id",
                    event.target.value
                  )
                }
                className={claseSelect(
                  slotMarcadoRojo(cruce.jugador_1_id, cruce),
                  !isAdmin
                )}
                aria-label={`Jugador 1 del cruce ${indice + 1}`}
              >
                {opciones}
              </select>
              <p className="text-center text-xs text-foreground/40">vs</p>
              <select
                value={cruce.jugador_2_id}
                disabled={!isAdmin}
                onChange={(event) =>
                  handleCambiarSlot(
                    cruce.id,
                    "jugador_2_id",
                    event.target.value
                  )
                }
                className={claseSelect(
                  slotMarcadoRojo(cruce.jugador_2_id, cruce),
                  !isAdmin
                )}
                aria-label={`Jugador 2 del cruce ${indice + 1}`}
              >
                {opciones}
              </select>
            </div>
          </li>
        ))}
      </ul>

      {isAdmin && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleVolverASortear}
            disabled={isConfirmando}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Volver a sortear
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={
              isConfirmando || duplicados.size > 0 || byeVsBye || !isAdmin
            }
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConfirmando
              ? "Guardando..."
              : "Confirmar y Guardar Cruces"}
          </button>
        </div>
      )}
    </section>
  );
}
