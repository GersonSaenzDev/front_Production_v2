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
}

export interface DataUserMenuResponse {
  ok: boolean;
  msg: UserDataMenu;
}
