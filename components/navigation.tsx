"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Award, CalendarClock, Home, LayoutDashboard, LogOut, Trophy, UserRound, Users } from "lucide-react";
import type { ComponentType } from "react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/components/auth-provider";

interface NavLink {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/torneos", label: "Torneos", icon: Trophy },
  { href: "/lo-que-viene", label: "Lo que viene", icon: CalendarClock },
  { href: "/jugadores", label: "Comunidad", icon: Users },
  { href: "/ranking", label: "Ranking", icon: Award },
  { href: "/perfil", label: "Mi Perfil", icon: UserRound },
];

function esRutaActiva(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin } = useAuth();

  if (
    pathname === "/login" ||
    pathname === "/vincular-perfil" ||
    pathname === "/recuperar-clave"
  ) {
    return null;
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-border md:bg-surface">
        <div className="border-b border-border px-6 py-6">
          <Image
            src="/logo-tenis-la-via.png"
            alt="Tenis La Vía"
            width={507}
            height={205}
            priority
            className="h-10 w-auto"
          />
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-4">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const isActive = esRutaActiva(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-accent/15 text-accent"
                    : "text-foreground/70 hover:bg-background hover:text-foreground"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
          {isAdmin ? (
            <Link
              href="/admin/panel"
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                esRutaActiva(pathname, "/admin")
                  ? "bg-accent/15 text-accent"
                  : "text-foreground/70 hover:bg-background hover:text-foreground"
              }`}
            >
              <LayoutDashboard size={18} />
              Panel de Control
            </Link>
          ) : null}
        </nav>

        <div className="border-t border-border p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/60 transition hover:bg-background hover:text-foreground"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <BottomNav />
    </>
  );
}
