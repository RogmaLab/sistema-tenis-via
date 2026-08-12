export type RolUsuario = "admin" | "jugador";

export interface Perfil {
  id: string;
  rol: RolUsuario;
  created_at?: string;
}
