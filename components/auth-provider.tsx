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
import type { RolUsuario } from "@/lib/auth/types";

interface AuthContextValue {
  user: User | null;
  rol: RolUsuario | null;
  isAdmin: boolean;
  loading: boolean;
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
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [rol, setRol] = useState<RolUsuario | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshPerfil = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const actual = data.user ?? null;
    setUser(actual);
    if (!actual) {
      setRol(null);
      return;
    }
    setRol(await fetchRol(supabase, actual.id));
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
          return;
        }
        setRol(await fetchRol(supabase, actual.id));
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
        setLoading(false);
        return;
      }
      setRol(await fetchRol(supabase, actual.id));
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
      refreshPerfil,
    }),
    [user, rol, loading, refreshPerfil]
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
  const { user, rol, isAdmin, loading, refreshPerfil } = useAuth();
  return { user, rol, isAdmin, loading, refreshPerfil };
}
