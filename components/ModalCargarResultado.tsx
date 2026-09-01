"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Ban, AlertCircle } from "lucide-react";
import { RESULTADO_WALKOVER } from "@/lib/motor-ranking";
import { nombreJugador } from "@/lib/nombre";
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

type FormatoSet3 = null | "full" | "super_tb";

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

function detectarFormatoSet3Inicial(resultado: string | null): FormatoSet3 {
  if (!resultado || resultado === RESULTADO_WALKOVER) return null;
  
  const partes = resultado.split(",").map((p) => p.trim());
  if (partes.length < 3) return null;
  
  const [a, b] = partes[2].split("-").map((v) => v.trim());
  const n1 = Number(a);
  const n2 = Number(b);
  
  if (!Number.isFinite(n1) || !Number.isFinite(n2)) return null;
  
  const max = Math.max(n1, n2);
  return max >= 10 ? "super_tb" : "full";
}

function esSetTenisValido(j1: string, j2: string): boolean {
  const n1 = Number(j1);
  const n2 = Number(j2);
  
  if (!Number.isFinite(n1) || !Number.isFinite(n2)) return false;
  if (n1 < 0 || n2 < 0) return false;
  if (n1 > 7 || n2 > 7) return false;
  
  if (n1 === n2) return false;
  
  const ganador = Math.max(n1, n2);
  const perdedor = Math.min(n1, n2);
  
  if (ganador === 7) return perdedor === 5 || perdedor === 6;
  if (ganador === 6) return perdedor <= 4;
  
  return false;
}

function esSuperTieBreakValido(j1: string, j2: string): boolean {
  const n1 = Number(j1);
  const n2 = Number(j2);
  
  if (!Number.isFinite(n1) || !Number.isFinite(n2)) return false;
  if (n1 < 0 || n2 < 0) return false;
  if (n1 > 25 || n2 > 25) return false;
  
  if (n1 === n2) return false;
  
  const ganador = Math.max(n1, n2);
  const perdedor = Math.min(n1, n2);
  
  if (ganador < 10) return false;
  if (ganador === 10) return perdedor <= 8;
  if (ganador > 10) return ganador - perdedor === 2;
  
  return true;
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
  const [formatoSet3, setFormatoSet3] = useState<FormatoSet3>(() =>
    detectarFormatoSet3Inicial(partido.resultado)
  );
  const [ganadorManualId, setGanadorManualId] = useState<string | null>(
    partido.ganador_id
  );
  const [guardando, setGuardando] = useState(false);

  const validacionSets = useMemo(() => {
    const errores: string[] = [];
    
    const set1 = setsResultado[0];
    const set2 = setsResultado[1];
    const set3 = setsResultado[2];
    
    const set1Completo = set1.j1 !== "" && set1.j2 !== "";
    const set2Completo = set2.j1 !== "" && set2.j2 !== "";
    const set3Completo = set3.j1 !== "" && set3.j2 !== "";
    
    if (set1Completo && !esSetTenisValido(set1.j1, set1.j2)) {
      errores.push("Set 1 tiene un puntaje inválido para tenis");
    }
    
    if (set2Completo && !esSetTenisValido(set2.j1, set2.j2)) {
      errores.push("Set 2 tiene un puntaje inválido para tenis");
    }
    
    if (set3Completo) {
      if (!formatoSet3) {
        errores.push("Seleccioná el formato del Set 3");
      } else if (formatoSet3 === "full" && !esSetTenisValido(set3.j1, set3.j2)) {
        errores.push("Set 3 tiene un puntaje inválido para un tercer set normal");
      } else if (formatoSet3 === "super_tb" && !esSuperTieBreakValido(set3.j1, set3.j2)) {
        errores.push("Set 3 tiene un puntaje inválido para Super Tie-Break");
      }
    }
    
    return { errores, esValido: errores.length === 0 };
  }, [setsResultado, formatoSet3]);

  const setsValidos = useMemo(() => {
    const sets = setsResultado.filter((set, index) => {
      const completo = set.j1 !== "" && set.j2 !== "";
      if (!completo) return false;
      
      if (index < 2) return esSetTenisValido(set.j1, set.j2);
      
      if (index === 2) {
        if (!formatoSet3) return false;
        return formatoSet3 === "full"
          ? esSetTenisValido(set.j1, set.j2)
          : esSuperTieBreakValido(set.j1, set.j2);
      }
      
      return false;
    });
    
    return sets;
  }, [setsResultado, formatoSet3]);

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
    : setsValidos.length >= 2 && Boolean(ganadorId) && validacionSets.esValido;

  function handleCambiarSet(index: number, jugador: "j1" | "j2", valor: string) {
    let valorLimpio = valor.replace(/[^0-9]/g, "");
    
    if (index < 2) {
      if (valorLimpio.length > 1) valorLimpio = valorLimpio.slice(0, 1);
      const num = Number(valorLimpio);
      if (num > 7) valorLimpio = "7";
    } else if (index === 2) {
      if (formatoSet3 === "full") {
        if (valorLimpio.length > 1) valorLimpio = valorLimpio.slice(0, 1);
        const num = Number(valorLimpio);
        if (num > 7) valorLimpio = "7";
      } else if (formatoSet3 === "super_tb") {
        if (valorLimpio.length > 2) valorLimpio = valorLimpio.slice(0, 2);
        const num = Number(valorLimpio);
        if (num > 25) valorLimpio = "25";
      }
    }
    
    setSetsResultado((prev) =>
      prev.map((set, i) => (i === index ? { ...set, [jugador]: valorLimpio } : set))
    );
    setGanadorManualId(null);
  }

  function handleCambiarFormatoSet3(formato: FormatoSet3) {
    setFormatoSet3(formato);
    
    if (formato !== formatoSet3) {
      setSetsResultado((prev) =>
        prev.map((set, i) => (i === 2 ? { j1: "", j2: "" } : set))
      );
    }
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
          {nombreJugador(partido.jugador_1, "?")} vs{" "}
          {nombreJugador(partido.jugador_2, "?")}
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
                    {nombreJugador(partido.jugador_1, "Lado 1")}
                  </span>
                  <span />
                  <span className="truncate text-center">
                    {nombreJugador(partido.jugador_2, "Lado 2")}
                  </span>
                </div>

                {setsResultado.slice(0, 2).map((set, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_4.5rem_1.5rem_4.5rem] items-center gap-2 border-t border-border px-3 py-2.5"
                  >
                    <label
                      htmlFor={`set-${index}-j1`}
                      className="text-sm text-foreground/70"
                    >
                      Set {index + 1}
                      <span className="ml-1 text-[10px] text-foreground/30">
                        (obligatorio)
                      </span>
                    </label>
                    <input
                      id={`set-${index}-j1`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
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
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={set.j2}
                      onChange={(event) =>
                        handleCambiarSet(index, "j2", event.target.value)
                      }
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-center text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                ))}
                
                <div className="border-t border-border bg-background/30 px-3 py-3">
                  <label className="mb-2 block text-xs font-medium text-foreground/70">
                    Formato Set 3{" "}
                    <span className="font-normal text-foreground/40">
                      (opcional)
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleCambiarFormatoSet3("full")}
                      className={`flex-1 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition ${
                        formatoSet3 === "full"
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border bg-background text-foreground/60 hover:border-foreground/30 hover:text-foreground"
                      }`}
                    >
                      Tercer Set
                      <span className="mt-0.5 block text-[10px] opacity-60">
                        (6 games)
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCambiarFormatoSet3("super_tb")}
                      className={`flex-1 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition ${
                        formatoSet3 === "super_tb"
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border bg-background text-foreground/60 hover:border-foreground/30 hover:text-foreground"
                      }`}
                    >
                      Super Tie-Break
                      <span className="mt-0.5 block text-[10px] opacity-60">
                        (a 10 pts)
                      </span>
                    </button>
                  </div>
                </div>

                {formatoSet3 ? (
                  <div className="grid grid-cols-[1fr_4.5rem_1.5rem_4.5rem] items-center gap-2 border-t border-border px-3 py-2.5">
                    <span className="text-sm text-foreground/70">
                      Set 3
                      {formatoSet3 === "super_tb" && (
                        <span className="ml-1 text-[10px] text-accent">
                          (Super TB)
                        </span>
                      )}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={formatoSet3 === "full" ? 1 : 2}
                      value={setsResultado[2].j1}
                      onChange={(event) =>
                        handleCambiarSet(2, "j1", event.target.value)
                      }
                      placeholder={formatoSet3 === "full" ? "0-7" : "0-25"}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-center text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                    <span className="text-center text-xs text-foreground/30">
                      -
                    </span>
                    <input
                      aria-label="Set 3, games del lado 2"
                      type="text"
                      inputMode="numeric"
                      maxLength={formatoSet3 === "full" ? 1 : 2}
                      value={setsResultado[2].j2}
                      onChange={(event) =>
                        handleCambiarSet(2, "j2", event.target.value)
                      }
                      placeholder={formatoSet3 === "full" ? "0-7" : "0-25"}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-center text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                ) : null}
              </div>

              {validacionSets.errores.length > 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                  <AlertCircle
                    size={14}
                    className="mt-0.5 shrink-0 text-red-400"
                  />
                  <div className="min-w-0 flex-1">
                    {validacionSets.errores.map((error, i) => (
                      <p key={i} className="text-xs text-red-300">
                        {error}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <p className="text-xs text-foreground/40">
                  {resultadoSets ? (
                    <>
                      Se va a guardar como:{" "}
                      <span className="font-semibold">{resultadoSets}</span>
                      {formatoSet3 === "super_tb" && setsValidos.length === 3 && (
                        <span className="ml-1 text-accent">
                          (Set 3 es Super TB)
                        </span>
                      )}
                    </>
                  ) : (
                    "Cargá al menos el Set 1 y el Set 2. El Set 3 es opcional."
                  )}
                </p>
                
                <details className="text-[10px] text-foreground/30">
                  <summary className="cursor-pointer hover:text-foreground/50">
                    Ver puntajes válidos de tenis
                  </summary>
                  <div className="mt-1.5 space-y-1 rounded-lg bg-background/50 px-2 py-1.5">
                    <p>
                      <strong>Sets normales:</strong> 6-0, 6-1, 6-2, 6-3, 6-4, 7-5, 7-6
                    </p>
                    <p>
                      <strong>Super Tie-Break:</strong> Se juega a 10 puntos (ej: 10-8, 11-9, 12-10)
                    </p>
                  </div>
                </details>
              </div>
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
                      {nombreJugador(jugador)}
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

          <div className="flex flex-col gap-3 pt-2">
            {!puedeGuardar && !esWalkover && setsValidos.length >= 2 && !validacionSets.esValido ? (
              <p className="text-center text-xs text-red-400">
                Corregí los errores de validación antes de guardar
              </p>
            ) : null}
            
            <div className="flex gap-3">
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
          </div>
        </form>
      </div>
    </div>
  );
}
