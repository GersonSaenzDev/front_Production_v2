// src/app/models/auth.models.ts
export interface LoginRequest {
  user: string;
  pass: string;
}

export interface AuthResponse {
  ok: boolean;
  msg: string; // Este es el token cifrado
}
