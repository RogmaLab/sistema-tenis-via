import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Necesario para react-tournament-brackets (usa styled-components).
  compiler: {
    styledComponents: true,
  },
  // Evita que Turbopack tome el package-lock del directorio padre
  // (hay una copia incompleta del app en la raíz del monorepo).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
