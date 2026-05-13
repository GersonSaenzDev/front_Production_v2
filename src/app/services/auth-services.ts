// Archivo: src/app/services/auth-services.ts
import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, tap, catchError, throwError, map } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthResponse, LoginRequest, DataUserMenuResponse, UserDataMenu } from '../interfaces/auth.interface';


@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Inyección de dependencias moderna
  private readonly http = inject(HttpClient);
  
  private readonly AUTH_KEY = 'x-token';
  private readonly API_URL = `${environment.backendUrl}${environment.api}/login`;

  // Usamos un signal o BehaviorSubject para manejar el estado de autenticación
  public isAuthenticated = signal<boolean>(this.checkToken());
  public userData = signal<UserDataMenu | null>(this.getInitialUserData());

  constructor() {}

  /**
   * Realiza el login y almacena el token si la respuesta es exitosa.
   */
  login(credentials: LoginRequest): Observable<AuthResponse> {
    // Definimos cabeceras para asegurar el envío de JSON
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

    return this.http.post<AuthResponse>(this.API_URL, credentials, { headers }).pipe(
      tap((response) => {
        if (response.ok && response.msg) {
          this.saveToken(response.msg);
          this.isAuthenticated.set(true);
        }
      }),
      catchError(this.handleError) // Referencia al método de abajo
    );
  }

  /**
   * Obtiene los datos del usuario para el menú.
   */
  getUserMenuData(): Observable<DataUserMenuResponse> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'x-token': this.getToken() || ''
    });

    const url = `${environment.backendUrl}${environment.api}/login/datausermenu`;
    return this.http.get<DataUserMenuResponse>(url, { headers }).pipe(
      tap((response) => {
        if (response.ok) {
          this.userData.set(response.msg);
          // Opcionalmente podemos guardar los datos en localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem('user-data', JSON.stringify(response.msg));
          }
        }
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Cierra la sesión eliminando el token.
   */
  logout(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.AUTH_KEY);
      localStorage.removeItem('user-data');
      this.isAuthenticated.set(false);
      this.userData.set(null);
    }
  }

  /**
   * Obtiene el token guardado.
   */
  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.AUTH_KEY);
    }
    return null;
  }

  // --- Métodos Privados de Soporte ---

  private saveToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.AUTH_KEY, token);
    }
  }

  private checkToken(): boolean {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem(this.AUTH_KEY);
    }
    return false;
  }

  private getInitialUserData(): UserDataMenu | null {
    if (typeof window !== 'undefined') {
      const data = localStorage.getItem('user-data');
      if (data) {
        try {
          return JSON.parse(data);
        } catch (e) {
          console.error('Error parsing user data from localStorage', e);
          return null;
        }
      }
    }
    return null;
  }

  private handleError(error: HttpErrorResponse) {
    // Imprimimos el error completo para debuguear
    console.error('Detalle del error de red:', error);
    
    let errorMessage = 'Error desconocido';
    if (error.status === 0) {
      errorMessage = 'No se pudo conectar con el servidor. Verifica que el backend en el puerto 3016 esté encendido.';
    } else if (error.status === 401) {
      errorMessage = 'Usuario o contraseña incorrectos.';
    } else {
      errorMessage = `Error del servidor: ${error.status}`;
    }

    return throwError(() => new Error(errorMessage));
  }
}