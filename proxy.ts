import type { NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/proxy";

// En Next.js 16 el archivo "middleware.ts" fue renombrado a "proxy.ts"
// (mismo comportamiento, distinto nombre de archivo/función). Ver
// https://nextjs.org/docs/app/api-reference/file-conventions/proxy
export async function proxy(request: NextRequest) {
  return actualizarSesion(request);
}

export const config = {
  matcher: [
    /*
     * Corre en todas las rutas excepto:
     * - _next/static (archivos estáticos generados por Next)
     * - _next/image (optimización de imágenes)
     * - archivos con extensión (favicon.ico, imágenes, css, etc. en /public)
     */
    "/((?!_next/static|_next/image|.*\\..*).*)",
  ],
};
