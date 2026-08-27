export const dynamic = "force-dynamic";

import { PanelControlClient } from "./panel-control-client";

export default function PanelControlPage() {
  return (
    <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Panel de Control
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Disponibilidad de canchas y auto-asignación de horarios del torneo.
          </p>
        </header>
        <PanelControlClient />
      </div>
    </main>
  );
}
