// src/app/models/auth.models.ts
export interface LoginRequest {
  user: string;
  pass: string;
}

export interface AuthResponse {
  ok: boolean;
  msg: string; // Este es el token cifrado
}

export interface UserDataMenu {
  full_name: string;
  area: string;
  departament: string;
  uid?: string;
  userApp?: string;
  subArea?: string;
  /** 'Jefe' | 'Empleado' | ... (viene del token de RH). Usado por MenuAccessService para
   * distinguir Jefe de Mantenimiento (acceso completo) de técnico (solo Cargue de Novedad). */
  typeUser?: string;
}

export interface DataUserMenuResponse {
  ok: boolean;
  msg: UserDataMenu;
}
