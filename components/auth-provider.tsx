"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import type { RolUsuario } from "@/lib/auth/types";
import { fetchResumenJugadorVinculado } from "@/lib/jugador-vinculado";

interface AuthContextValue {
  user: User | null;
  rol: RolUsuario | null;
  isAdmin: boolean;
  loading: boolean;
  /** Ficha de `jugadores` vinculada a esta cuenta, o null. */
  jugadorId: string | null;
  jugadorNombre: string | null;
  refreshPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchRol(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<RolUsuario> {
  const { data, error } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data?.rol) return "jugador";
  return data.rol === "admin" ? "admin" : "jugador";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(
    () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
    []
  );
  const [user, setUser] = useState<User | null>(null);
  const [rol, setRol] = useState<RolUsuario | null>(null);
  const [jugadorId, setJugadorId] = useState<string | null>(null);
  const [jugadorNombre, setJugadorNombre] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshPerfil = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const actual = data.user ?? null;
    setUser(actual);
    if (!actual) {
      setRol(null);
      setJugadorId(null);
      setJugadorNombre(null);
      return;
    }
    const [rolActual, resumen] = await Promise.all([
      fetchRol(supabase, actual.id),
      fetchResumenJugadorVinculado(supabase, actual.id),
    ]);
    setRol(rolActual);
    setJugadorId(resumen?.id ?? null);
    setJugadorNombre(resumen?.nombre_completo ?? null);
  }, [supabase]);

  useEffect(() => {
    let activo = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const actual = data.user ?? null;
        if (!activo) return;
        setUser(actual);
        if (!actual) {
          setRol(null);
          setJugadorId(null);
          setJugadorNombre(null);
          return;
        }
        const [rolActual, resumen] = await Promise.all([
          fetchRol(supabase, actual.id),
          fetchResumenJugadorVinculado(supabase, actual.id),
        ]);
        if (!activo) return;
        setRol(rolActual);
        setJugadorId(resumen?.id ?? null);
        setJugadorNombre(resumen?.nombre_completo ?? null);
      } finally {
        if (activo) setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const actual = session?.user ?? null;
      setUser(actual);
      if (!actual) {
        setRol(null);
        setJugadorId(null);
        setJugadorNombre(null);
        setLoading(false);
        return;
      }
      const [rolActual, resumen] = await Promise.all([
        fetchRol(supabase, actual.id),
        fetchResumenJugadorVinculado(supabase, actual.id),
      ]);
      setRol(rolActual);
      setJugadorId(resumen?.id ?? null);
      setJugadorNombre(resumen?.nombre_completo ?? null);
      setLoading(false);
    });

    return () => {
      activo = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      rol,
      isAdmin: rol === "admin",
      loading,
      jugadorId,
      jugadorNombre,
      refreshPerfil,
    }),
    [user, rol, loading, jugadorId, jugadorNombre, refreshPerfil]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return ctx;
}

/** Alias semántico: mismo contexto, enfocado al perfil/rol. */
export function usePerfil() {
  const { user, rol, isAdmin, loading, jugadorId, jugadorNombre, refreshPerfil } =
    useAuth();
  return { user, rol, isAdmin, loading, jugadorId, jugadorNombre, refreshPerfil };
}
