import type { NextConfig } from "next";
import path from "path";

const workspaceRoot = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  // El padre tiene otro lockfile y una copia incompleta de `app/`.
  // outputFileTracingRoot y turbopack.root tienen que coincidir; si
  // apuntan a esta carpeta, Next 16 infiere `app/` como project dir
  // y /torneos/[id] responde 404 / _not-found.
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
