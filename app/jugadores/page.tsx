// Wrapper Server Component: "dynamic" solo tiene efecto en archivos sin
// "use client", así que la UI interactiva vive en jugadores-client.tsx y
// este archivo únicamente fuerza el renderizado dinámico (SSR en cada
// request) para evitar que Next.js intente prerenderizarla como estática.
export const dynamic = "force-dynamic";

import { JugadoresClient } from "./jugadores-client";

export default function JugadoresPage() {
  return <JugadoresClient />;
}
