import Link from "next/link";
import { Suspense } from "react";
import { LoginPortal } from "./login-portal";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-4 inline-flex min-h-11 items-center text-sm font-medium text-foreground/60 transition hover:text-foreground"
        >
          ← Volver al torneo
        </Link>
        <Suspense fallback={null}>
          <LoginPortal />
        </Suspense>
      </div>
    </main>
  );
}
