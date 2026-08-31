import { Resend } from "resend";

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";

function escaparHtml(texto: string) {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlInscripcionConfirmada(params: {
  nombreJugador: string;
  nombreTorneo: string;
}) {
  const nombreJugador = escaparHtml(params.nombreJugador);
  const nombreTorneo = escaparHtml(params.nombreTorneo);

  return `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Inscripción confirmada</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="background-color:#111827;padding:24px 28px;">
                <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#a1a1aa;">Tenis La Vía</p>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;color:#ffffff;">¡Inscripción confirmada!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#27272a;">
                  ¡Hola <strong>${nombreJugador}</strong>!
                </p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#27272a;">
                  Tu pago fue validado exitosamente por la organización. Ya estás
                  oficialmente inscripto en el torneo
                  <strong>${nombreTorneo}</strong>.
                </p>
                <p style="margin:0;font-size:16px;line-height:1.6;color:#27272a;">
                  ¡Muchos éxitos!
                </p>
                <div style="margin-top:28px;padding:16px 18px;background-color:#f4f4f5;border-radius:12px;">
                  <p style="margin:0;font-size:13px;line-height:1.5;color:#52525b;">
                    Este correo es una confirmación automática. Ante cualquier duda,
                    contactá a la organización del torneo.
                  </p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

export async function enviarCorreoInscripcionConfirmada(params: {
  emailDestino: string;
  nombreJugador: string;
  nombreTorneo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY no está configurada." };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.emailDestino,
      subject: `¡Inscripción Confirmada! - ${params.nombreTorneo}`,
      html: htmlInscripcionConfirmada({
        nombreJugador: params.nombreJugador,
        nombreTorneo: params.nombreTorneo,
      }),
    });

    if (error) {
      return { ok: false, error: error.message || "Error al enviar el correo." };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado al enviar el correo.",
    };
  }
}
