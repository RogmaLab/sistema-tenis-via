import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { esAdmin } from "@/lib/auth/es-admin";

// Rutas públicas: accesibles sin sesión.
const RUTAS_PUBLICAS = ["/login"];

// Rutas exclusivas de creación/edición admin.
// El CRUD actual vive en modales sobre páginas compartidas (lectura OK para
// jugadores); RLS bloquea writes. Reservamos paths dedicados acá.
const RUTAS_SOLO_ADMIN: string[] = [
  // Ejemplos futuros: "/admin", "/torneos/nuevo", "/jugadores/nuevo"
];

function esRutaPublica(pathname: string) {
  return RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  );
}

function esRutaSoloAdmin(pathname: string) {
  return RUTAS_SOLO_ADMIN.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  );
}

// Se ejecuta en cada request (ver matcher en proxy.ts). Refresca la sesión
// de Supabase y aplica el candado de rutas.
export async function actualizarSesion(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // No usar `getSession()` acá: `getUser()` valida el token contra el
  // servidor de Supabase en vez de confiar ciegamente en la cookie.
  const { data } = await supabase.auth.getUser();
  const usuario = data.user;

  const { pathname } = request.nextUrl;
  const esPublica = esRutaPublica(pathname);

  if (!usuario && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect_to", pathname);
    return NextResponse.redirect(url);
  }

  // Si ya hay sesión activa, no tiene sentido mostrar el login de nuevo.
  if (usuario && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("redirect_to");
    return NextResponse.redirect(url);
  }

  // Patovica: rutas exclusivas de admin → sin sesión o sin rol admin → Inicio.
  if (esRutaSoloAdmin(pathname)) {
    if (!usuario) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    const admin = await esAdmin(supabase, usuario.id);
    if (!admin) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
