// src/app/services/socket-service.ts
// Cliente Socket.IO para escuchar eventos en tiempo real del backend de produccion.
//
// Requiere:  npm install socket.io-client
//
// Uso tipico (desde un componente):
//   private socket = inject(SocketService);
//   ngOnInit() {
//     this.socket.productionNewsCreated$.subscribe(({ news }) => this.bandeja.unshift(news));
//   }
//
// La conexion y desconexion son orquestadas desde AuthService (login/logout)
// y desde APP startup si ya hay token en localStorage.

import { Injectable, signal, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { environment } from 'src/environments/environment';

// --- Tipos de eventos emitidos por el backend (ver src/sockets/index.js en el API) ---

export type ProductionNewsAction = 'created' | 'responded' | 'redirected' | 'closed';

export interface ProductionNewsEvent {
  action: ProductionNewsAction;
  news: any; // shape completo de ProductionNews; tipar fuerte cuando se centralice la interface
}

export interface ProductionNewsRedirectedEvent extends ProductionNewsEvent {
  action: 'redirected';
  previousArea?: string;
  newArea?: string;
}

export type SocketConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type SocketAuthError = 'TOKEN_MISSING' | 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'AUTH_ERROR' | 'UNKNOWN';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  // Estado reactivo de la conexion (consumible desde plantillas con signals)
  public status = signal<SocketConnectionStatus>('disconnected');
  public lastError = signal<SocketAuthError | null>(null);

  // Streams tipados por evento de negocio
  private readonly _created$ = new Subject<ProductionNewsEvent>();
  private readonly _responded$ = new Subject<ProductionNewsEvent>();
  private readonly _redirected$ = new Subject<ProductionNewsRedirectedEvent>();
  private readonly _closed$ = new Subject<ProductionNewsEvent>();

  readonly productionNewsCreated$: Observable<ProductionNewsEvent> = this._created$.asObservable();
  readonly productionNewsResponded$: Observable<ProductionNewsEvent> = this._responded$.asObservable();
  readonly productionNewsRedirected$: Observable<ProductionNewsRedirectedEvent> = this._redirected$.asObservable();
  readonly productionNewsClosed$: Observable<ProductionNewsEvent> = this._closed$.asObservable();

  /**
   * Conecta al servidor de WebSockets usando el token recibido.
   * Si ya hay una conexion abierta se reutiliza (idempotente).
   */
  connect(token: string | null): void {
    if (typeof window === 'undefined') return; // guard SSR
    if (!token) {
      this.lastError.set('TOKEN_MISSING');
      return;
    }
    if (this.socket?.connected) return;

    // Si habia un socket previo (p. ej. tras re-login), lo cerramos antes de abrir uno nuevo
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.status.set('connecting');
    this.lastError.set(null);

    this.socket = io(environment.backendUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
    });

    this.bindLifecycleHandlers();
    this.bindBusinessHandlers();
  }

  /** Cierra la conexion (llamar en logout). */
  disconnect(): void {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.status.set('disconnected');
  }

  /**
   * Suscribe el socket a una room de area extra (util para supervisores
   * que monitorean varias areas a la vez).
   */
  subscribeToArea(area: string): void {
    this.socket?.emit('subscribe:area', area);
  }

  unsubscribeFromArea(area: string): void {
    this.socket?.emit('unsubscribe:area', area);
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private bindLifecycleHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.status.set('connected');
      this.lastError.set(null);
    });

    this.socket.on('disconnect', (reason) => {
      // 'io server disconnect' = el servidor nos cerro (token rechazado, etc.)
      // En esos casos socket.io NO reintenta automaticamente.
      this.status.set(reason === 'io server disconnect' ? 'disconnected' : 'reconnecting');
    });

    this.socket.io.on('reconnect_attempt', () => this.status.set('reconnecting'));
    this.socket.io.on('reconnect_failed', () => this.status.set('error'));

    this.socket.on('connect_error', (err: Error) => {
      // El backend rechaza con next(new Error('TOKEN_EXPIRED')) etc.
      // El mensaje llega como err.message.
      const code = this.normalizeAuthError(err?.message);
      this.lastError.set(code);
      this.status.set('error');
      console.warn(`[SocketService] connect_error: ${err?.message}`);
    });
  }

  private bindBusinessHandlers(): void {
    if (!this.socket) return;

    this.socket.on('productionNews:created', (payload: ProductionNewsEvent) => this._created$.next(payload));
    this.socket.on('productionNews:responded', (payload: ProductionNewsEvent) => this._responded$.next(payload));
    this.socket.on('productionNews:redirected', (payload: ProductionNewsRedirectedEvent) => this._redirected$.next(payload));
    this.socket.on('productionNews:closed', (payload: ProductionNewsEvent) => this._closed$.next(payload));
  }

  private normalizeAuthError(message?: string): SocketAuthError {
    switch (message) {
      case 'TOKEN_MISSING':
      case 'TOKEN_EXPIRED':
      case 'TOKEN_INVALID':
      case 'AUTH_ERROR':
        return message;
      default:
        return 'UNKNOWN';
    }
  }
}
