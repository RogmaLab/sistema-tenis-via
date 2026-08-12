"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, Home, Trophy, Users, type LucideIcon } from "lucide-react";

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/torneos", label: "Torneos", icon: Trophy },
  { href: "/jugadores", label: "Jugadores", icon: Users },
  { href: "/ranking", label: "Ranking", icon: Award },
];

function esRutaActiva(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <nav
      className="fixed bottom-0 z-50 flex w-full border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Navegación principal"
    >
      <div className="flex w-full justify-around">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = esRutaActiva(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex h-16 min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                isActive ? "text-accent" : "text-foreground/55"
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
