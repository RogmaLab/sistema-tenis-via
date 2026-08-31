"use client";

import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";

const INSTAGRAM_ROGMALAB = "https://www.instagram.com/rogmalab/";
const VERDE_NEON_ROGMA = "#2BE973";

function LogoTetraedroRogma({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {/* Cara exterior del tetraedro */}
      <path
        d="M12 2.4 22.2 20.6H1.8Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      {/* Aristas internas hacia el vértice (efecto 3D) */}
      <path
        d="M12 2.4 12 14.2M22.2 20.6 12 14.2M1.8 20.6 12 14.2"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CreditoRogmaLab() {
  const pathname = usePathname();
  if (
    pathname === "/login" ||
    pathname === "/vincular-perfil" ||
    pathname === "/recuperar-clave"
  ) {
    return null;
  }

  return (
    <p className="flex justify-end px-4 pb-6 pt-4 print:hidden sm:px-6 lg:px-10">
      <span className="inline-flex items-center gap-1.5 text-xs text-foreground/45 sm:text-sm">
        Diseñado y desarrollado por
        <a
          href={INSTAGRAM_ROGMALAB}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold tracking-tight text-foreground transition hover:opacity-80"
        >
          <span className="inline-flex items-center gap-1.5">
            <LogoTetraedroRogma
              className="h-4 w-4 shrink-0"
              style={{
                color: VERDE_NEON_ROGMA,
                filter: `drop-shadow(0 0 5px ${VERDE_NEON_ROGMA})`,
              }}
            />
            RogmaLab
          </span>
        </a>
      </span>
    </p>
  );
}
