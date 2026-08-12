"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Award, Home, LogOut, Trophy, Users } from "lucide-react";
import type { ComponentType } from "react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/BottomNav";

interface NavLink {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
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

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();

  // El proxy protege todas las rutas salvo /login: no tiene sentido mostrar
  // la navegación (ni exponer "Cerrar sesión") ahí.
  if (pathname === "/login") return null;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Sidebar — solo pantallas md+ (oficinistas) */}
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

      {/* Bottom tab bar — solo mobile */}
      <BottomNav />
    </>
  );
}
