"use client";

import { Suspense } from "react";
import { LoginPortal } from "./login-portal";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Suspense fallback={null}>
        <LoginPortal />
      </Suspense>
    </main>
  );
}
