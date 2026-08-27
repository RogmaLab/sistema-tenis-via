"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Ban } from "lucide-react";
import { RESULTADO_WALKOVER } from "@/lib/motor-ranking";
import { useAuth } from "@/components/auth-provider";

interface JugadorResultado {
  id: string;
  nombre_completo: string;
}

export interface PartidoParaResultado {
  id: string;
  estado: string;
  resultado: string | null;
  ganador_id: string | null;
  jugador_1: JugadorResultado | null;
  jugador_2: JugadorResultado | null;
}

interface SetScore {
  j1: string;
  j2: string;
}

const SETS_VACIOS: SetScore[] = [
  { j1: "", j2: "" },
  { j1: "", j2: "" },
  { j1: "", j2: "" },
];

interface ModalCargarResultadoProps {
  partido: PartidoParaResultado;
  onCerrar: () => void;
  onGuardar: (payload: {
    resultado: string;
    ganador_id: string;
  }) => Promise<void>;
}

function parsearResultadoASets(resultado: string | null): SetScore[] {
  const sets = SETS_VACIOS.map((set) => ({ ...set }));
  if (!resultado || resultado === RESULTADO_WALKOVER) return sets;

  const partes = resultado.split(",").map((parte) => parte.trim());
  for (let i = 0; i < Math.min(partes.length, sets.length); i += 1) {
    const [j1, j2] = partes[i].split("-").map((valor) => valor.trim());
    if (j1 !== undefined && j2 !== undefined) {
      sets[i] = { j1, j2 };
    }
  }
  return sets;
}

export function ModalCargarResultado({
  partido,
  onCerrar,
  onGuardar,
}: ModalCargarResultadoProps) {
  const { isAdmin } = useAuth();
  const yaFinalizado = partido.estado === "Finalizado";
  const ambosJugadores = Boolean(partido.jugador_1 && partido.jugador_2);

  const [esWalkover, setEsWalkover] = useState(
    partido.resultado === RESULTADO_WALKOVER
  );
  const [setsResultado, setSetsResultado] = useState(() =>
    parsearResultadoASets(partido.resultado)
  );
  const [ganadorManualId, setGanadorManualId] = useState<string | null>(
    partido.ganador_id
  );
  const [guardando, setGuardando] = useState(false);

  const setsValidos = useMemo(
    () => setsResultado.filter((set) => set.j1 !== "" && set.j2 !== ""),
    [setsResultado]
  );

  const resultadoSets = useMemo(
    () => setsValidos.map((set) => `${set.j1}-${set.j2}`).join(", "),
    [setsValidos]
  );

  const setsGanadosJugador1 = setsValidos.filter(
    (set) => Number(set.j1) > Number(set.j2)
  ).length;
  const setsGanadosJugador2 = setsValidos.filter(
    (set) => Number(set.j2) > Number(set.j1)
  ).length;

  const ganadorAutomaticoId = useMemo(() => {
    if (esWalkover || setsValidos.length === 0) return null;
    if (setsGanadosJugador1 === setsGanadosJugador2) return null;
    return setsGanadosJugador1 > setsGanadosJugador2
      ? (partido.jugador_1?.id ?? null)
      : (partido.jugador_2?.id ?? null);
  }, [
    esWalkover,
    partido.jugador_1?.id,
    partido.jugador_2?.id,
    setsGanadosJugador1,
    setsGanadosJugador2,
    setsValidos.length,
  ]);

  const ganadorId = esWalkover
    ? ganadorManualId
    : (ganadorManualId ?? ganadorAutomaticoId);

  const puedeGuardar = esWalkover
    ? Boolean(ganadorId)
    : setsValidos.length >= 2 && Boolean(ganadorId);

  function handleCambiarSet(index: number, jugador: "j1" | "j2", valor: string) {
    setSetsResultado((prev) =>
      prev.map((set, i) => (i === index ? { ...set, [jugador]: valor } : set))
    );
    setGanadorManualId(null);
  }

  function handleToggleWalkover() {
    setEsWalkover((activo) => {
      const siguiente = !activo;
      if (siguiente && !ganadorManualId && ganadorAutomaticoId) {
        setGanadorManualId(ganadorAutomaticoId);
      }
      return siguiente;
    });
  }

  async function handleGuardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !puedeGuardar || !ganadorId) return;

    setGuardando(true);
    try {
      await onGuardar({
        resultado: esWalkover ? RESULTADO_WALKOVER : resultadoSets,
        ganador_id: ganadorId,
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
      onClick={onCerrar}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40 sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {yaFinalizado ? "Editar Resultado" : "Cargar Resultado"}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-foreground/50 transition hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <p className="mb-5 text-sm text-foreground/60">
          {partido.jugador_1?.nombre_completo ?? "?"} vs{" "}
          {partido.jugador_2?.nombre_completo ?? "?"}
        </p>

        <form onSubmit={handleGuardar} className="space-y-5">
          {ambosJugadores ? (
            <button
              type="button"
              role="switch"
              aria-checked={esWalkover}
              onClick={handleToggleWalkover}
              className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                esWalkover
                  ? "border-accent bg-accent/15"
                  : "border-border bg-background hover:border-foreground/20"
              }`}
            >
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  esWalkover
                    ? "bg-accent/20 text-accent"
                    : "bg-foreground/5 text-foreground/45"
                }`}
              >
                <Ban size={16} strokeWidth={2.25} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  W.O. / No presentación
                </span>
                <span className="mt-0.5 block text-xs text-foreground/50">
                  El rival no se presentó o se retiró. No hace falta cargar
                  sets.
                </span>
              </span>
              <span
                className={`relative mt-1 h-6 w-10 shrink-0 rounded-full transition ${
                  esWalkover ? "bg-accent" : "bg-foreground/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    esWalkover ? "translate-x-[18px]" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
          ) : null}

          {!esWalkover ? (
            <div className="space-y-2">
              <p className="block text-sm font-medium text-foreground/80">
                Resultado por sets
              </p>

              <div className="overflow-hidden rounded-xl border border-border">
                <div className="grid grid-cols-[1fr_4.5rem_1.5rem_4.5rem] items-center gap-2 bg-background/60 px-3 py-2 text-xs font-medium text-foreground/40">
                  <span />
                  <span className="truncate text-center">
                    {partido.jugador_1?.nombre_completo ?? "Lado 1"}
                  </span>
                  <span />
                  <span className="truncate text-center">
                    {partido.jugador_2?.nombre_completo ?? "Lado 2"}
                  </span>
                </div>

                {setsResultado.map((set, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_4.5rem_1.5rem_4.5rem] items-center gap-2 border-t border-border px-3 py-2.5"
                  >
                    <label
                      htmlFor={`set-${index}-j1`}
                      className="text-sm text-foreground/70"
                    >
                      {index < 2 ? `Set ${index + 1}` : "Set 3 / Super TB"}
                      {index === 2 && (
                        <span className="ml-1 text-xs text-foreground/30">
                          (opcional)
                        </span>
                      )}
                    </label>
                    <input
                      id={`set-${index}-j1`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={set.j1}
                      onChange={(event) =>
                        handleCambiarSet(index, "j1", event.target.value)
                      }
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-center text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                    <span className="text-center text-xs text-foreground/30">
                      -
                    </span>
                    <input
                      aria-label={`Set ${index + 1}, games del lado 2`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={set.j2}
                      onChange={(event) =>
                        handleCambiarSet(index, "j2", event.target.value)
                      }
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-center text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                ))}
              </div>

              <p className="text-xs text-foreground/40">
                {resultadoSets
                  ? `Se va a guardar como: ${resultadoSets}`
                  : "Cargá al menos el Set 1 y el Set 2. El Set 3 es opcional."}
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-foreground/70">
              Se va a guardar como: <span className="font-semibold">W.O.</span>
            </p>
          )}

          <div className="space-y-2">
            <p className="block text-sm font-medium text-foreground/80">
              {esWalkover ? "Quién avanza por W.O." : "Quién ganó"}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[partido.jugador_1, partido.jugador_2].map(
                (jugador) =>
                  jugador && (
                    <button
                      key={jugador.id}
                      type="button"
                      onClick={() => setGanadorManualId(jugador.id)}
                      className={`flex items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                        ganadorId === jugador.id
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border bg-background text-foreground/60 hover:text-foreground"
                      }`}
                    >
                      {jugador.nombre_completo}
                    </button>
                  )
              )}
            </div>
            <p className="text-xs text-foreground/40">
              {esWalkover
                ? "Elegí quién avanza. El otro no se presentó o se retiró."
                : "Se calcula solo según los sets. Tocá un nombre para corregirlo a mano."}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCerrar}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!puedeGuardar || guardando}
              className="flex-1 rounded-lg bg-[#ea580c] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c2410c] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar resultado"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
