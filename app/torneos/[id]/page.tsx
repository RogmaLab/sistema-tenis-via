// Wrapper Server Component: "dynamic" solo tiene efecto en archivos sin
// "use client", así que la UI interactiva vive en torneo-detalle-client.tsx
// (que además obtiene el id de la URL con useParams) y este archivo
// únicamente fuerza el renderizado dinámico (SSR en cada request) para
// evitar que Next.js intente prerenderizarla como estática.
export const dynamic = "force-dynamic";

import { TorneoDetalleClient } from "./torneo-detalle-client";

export default function TorneoDetallePage() {
  return <TorneoDetalleClient />;
}
