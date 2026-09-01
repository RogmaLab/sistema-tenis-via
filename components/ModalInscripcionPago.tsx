"use client";

import { useMemo, useState } from "react";
import {
  X,
  DollarSign,
  Info,
  User,
  CreditCard,
  ArrowLeft,
  Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { crearInscripcion } from "@/lib/inscripciones-pago";
import {
  calcularPrecioEfectivo,
  formatearPrecioAr,
  type MedioPagoInscripcion,
} from "@/lib/inscripciones-precio";
import { formatearNombre } from "@/lib/nombre";

type PasoModal = "pago" | "titular" | "confirmar_efectivo";
type OrigenTitular = "propio" | "otro";

interface ModalInscripcionPagoProps {
  torneoId: string;
  torneoNombre: string;
  jugadorId: string;
  jugadorNombre: string;
  precioInscripcion: number;
  aceptaEfectivo: boolean;
  aliasCbu: string | null;
  titular: string | null;
  onClose: () => void;
  onInscripcionCreada: () => void;
}

export function ModalInscripcionPago({
  torneoId,
  torneoNombre,
  jugadorId,
  jugadorNombre,
  precioInscripcion,
  aceptaEfectivo,
  aliasCbu,
  titular,
  onClose,
  onInscripcionCreada,
}: ModalInscripcionPagoProps) {
  const [paso, setPaso] = useState<PasoModal>("pago");
  const [medioPago, setMedioPago] = useState<MedioPagoInscripcion>(
    "transferencia"
  );
  const [origenTitular, setOrigenTitular] = useState<OrigenTitular | null>(
    null
  );
  const [titularOtro, setTitularOtro] = useState("");
  const [notificando, setNotificando] = useState(false);

  const aliasMostrado = aliasCbu?.trim() || null;
  const titularDestino = titular?.trim() || null;
  const hayDatosPago = Boolean(aliasMostrado || titularDestino);
  const precioEfectivo = useMemo(
    () => calcularPrecioEfectivo(precioInscripcion),
    [precioInscripcion]
  );
  const muestraOpcionEfectivo = aceptaEfectivo && precioInscripcion > 0;

  const titularPagoFinal = useMemo(() => {
    if (origenTitular === "propio") return jugadorNombre.trim();
    if (origenTitular === "otro") return titularOtro.trim();
    return "";
  }, [origenTitular, jugadorNombre, titularOtro]);

  const puedeConfirmarTransferencia =
    origenTitular === "propio" ||
    (origenTitular === "otro" && titularOtro.trim().length >= 3);

  async function enviarInscripcion(opciones: {
    medioPago: MedioPagoInscripcion;
    titularPago?: string | null;
  }) {
    setNotificando(true);
    try {
      const supabase = createClient();
      await crearInscripcion(supabase, {
        torneoId,
        jugadorId,
        medioPago: opciones.medioPago,
        titularPago: opciones.titularPago,
      });
      toast.success(
        opciones.medioPago === "efectivo"
          ? "Inscripción registrada. Acercate al club para abonar en efectivo."
          : "Inscripción registrada. La organización verificará tu pago en breve.",
        { duration: 5000 }
      );
      onInscripcionCreada();
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo crear la inscripción."
      );
    } finally {
      setNotificando(false);
    }
  }

  async function handleConfirmarTransferencia() {
    if (!puedeConfirmarTransferencia) {
      toast.error("Completá el nombre del titular de la cuenta.");
      return;
    }
    await enviarInscripcion({
      medioPago: "transferencia",
      titularPago: titularPagoFinal,
    });
  }

  async function handleConfirmarEfectivo() {
    await enviarInscripcion({ medioPago: "efectivo" });
  }

  function handleContinuarDesdePago() {
    if (medioPago === "efectivo") {
      setPaso("confirmar_efectivo");
      return;
    }
    setPaso("titular");
  }

  const tituloPaso =
    paso === "pago"
      ? "Inscripción al Torneo"
      : paso === "titular"
        ? "Confirmar titular"
        : "Confirmar pago en efectivo";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">{tituloPaso}</h2>
            <p className="mt-1 text-sm text-foreground/60">{torneoNombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-foreground/60 transition hover:bg-background hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        {paso === "pago" ? (
          <>
            <div className="mb-4 space-y-3">
              <p className="text-sm font-medium text-foreground/70">
                ¿Cómo vas a abonar la inscripción?
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMedioPago("transferencia")}
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    medioPago === "transferencia"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-background text-foreground/70 hover:border-foreground/30"
                  }`}
                >
                  Transferencia
                  <span className="mt-1 block text-xs font-normal text-foreground/50">
                    ${formatearPrecioAr(precioInscripcion)}
                  </span>
                </button>
                {muestraOpcionEfectivo ? (
                  <button
                    type="button"
                    onClick={() => setMedioPago("efectivo")}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      medioPago === "efectivo"
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                        : "border-border bg-background text-foreground/70 hover:border-foreground/30"
                    }`}
                  >
                    Efectivo en el club
                    <span className="mt-1 block text-xs font-normal text-foreground/50">
                      ${formatearPrecioAr(precioEfectivo)} (10% off)
                    </span>
                  </button>
                ) : null}
              </div>
            </div>

            {medioPago === "transferencia" ? (
              <>
                <div className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-background p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15">
                    <DollarSign size={24} className="text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground/60">
                      Precio por transferencia
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      ${formatearPrecioAr(precioInscripcion)}
                    </p>
                  </div>
                </div>

                {hayDatosPago ? (
                  <div className="mb-5 space-y-3 rounded-xl border border-border bg-background p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Datos para realizar la transferencia
                    </h3>
                    {titularDestino ? (
                      <div className="flex items-start gap-3">
                        <User
                          size={16}
                          className="mt-0.5 shrink-0 text-foreground/45"
                        />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">
                            Titular destino
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {titularDestino}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {aliasMostrado ? (
                      <div className="flex items-start gap-3">
                        <CreditCard
                          size={16}
                          className="mt-0.5 shrink-0 text-foreground/45"
                        />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">
                            Alias / CBU
                          </p>
                          <p className="break-all text-sm font-semibold text-accent">
                            {aliasMostrado}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mb-5 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-400/90">
                    La organización aún no cargó los datos de pago para este
                    torneo. Consultá con la organización antes de transferir.
                  </div>
                )}

                <div className="mb-5 flex gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
                  <Info size={18} className="mt-0.5 shrink-0 text-blue-500" />
                  <p className="text-sm leading-relaxed text-blue-500/90">
                    Realizá la transferencia por el monto indicado y luego
                    continuá. Te vamos a pedir el titular de la cuenta desde la
                    que pagaste.
                  </p>
                </div>
              </>
            ) : (
              <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <Banknote
                    size={20}
                    className="mt-0.5 shrink-0 text-emerald-400"
                  />
                  <div>
                    <p className="text-sm font-semibold text-emerald-300">
                      O aboná en efectivo en el club (10% off)
                    </p>
                    <p className="mt-2 text-sm text-emerald-200/80">
                      Precio regular: ${formatearPrecioAr(precioInscripcion)}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-emerald-100">
                      ${formatearPrecioAr(precioEfectivo)}
                    </p>
                    <p className="mt-2 text-xs text-emerald-300/80">
                      Acercate al club para abonar en persona. Al confirmar, la
                      organización verá que elegiste esta opción.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleContinuarDesdePago}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                {medioPago === "efectivo"
                  ? "Elegí pagar en efectivo"
                  : "Ya transferí / Notificar Pago"}
              </button>
            </div>
          </>
        ) : paso === "titular" ? (
          <>
            <p className="mb-4 text-sm text-foreground/70">
              ¿A nombre de quién está la cuenta desde la que transferiste?
            </p>

            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setOrigenTitular("propio")}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  origenTitular === "propio"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-foreground/70 hover:border-foreground/30"
                }`}
              >
                A mi nombre
                <span className="mt-1 block text-xs font-normal text-foreground/50">
                  {formatearNombre(jugadorNombre) || jugadorNombre}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOrigenTitular("otro")}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  origenTitular === "otro"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-foreground/70 hover:border-foreground/30"
                }`}
              >
                A nombre de otra persona
              </button>
            </div>

            {origenTitular === "otro" ? (
              <div className="mb-4 space-y-1.5">
                <label
                  htmlFor="titular_otro"
                  className="block text-sm font-medium text-foreground/80"
                >
                  Nombre completo del titular de la cuenta
                </label>
                <input
                  id="titular_otro"
                  type="text"
                  value={titularOtro}
                  onChange={(event) => setTitularOtro(event.target.value)}
                  placeholder="Ej: Luciana Gómez"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
            ) : null}

            {origenTitular === "propio" ? (
              <div className="mb-4 rounded-xl border border-border bg-background p-3 text-sm text-foreground/70">
                Se registrará como titular de pago:{" "}
                <span className="font-semibold text-foreground">
                  {jugadorNombre}
                </span>
              </div>
            ) : null}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPaso("pago")}
                disabled={notificando}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background disabled:opacity-50"
              >
                <ArrowLeft size={16} />
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirmarTransferencia}
                disabled={notificando || !puedeConfirmarTransferencia}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {notificando ? "Enviando..." : "Confirmar Envío"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm text-emerald-200/90">
                Vas a abonar en efectivo en el club:
              </p>
              <p className="mt-2 text-3xl font-bold text-emerald-100">
                ${formatearPrecioAr(precioEfectivo)}
              </p>
              <p className="mt-2 text-xs text-emerald-300/80">
                Descuento del 10% aplicado sobre $
                {formatearPrecioAr(precioInscripcion)}.
              </p>
            </div>

            <div className="mb-5 flex gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
              <Info size={18} className="mt-0.5 shrink-0 text-blue-500" />
              <p className="text-sm leading-relaxed text-blue-500/90">
                Al confirmar, la organización verá que elegiste pagar en efectivo.
                La organización validará tu inscripción cuando recibas el pago en
                el club.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPaso("pago")}
                disabled={notificando}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background disabled:opacity-50"
              >
                <ArrowLeft size={16} />
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirmarEfectivo}
                disabled={notificando}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {notificando ? "Enviando..." : "Confirmar Envío"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
