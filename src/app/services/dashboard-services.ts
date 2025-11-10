// src/app/services/dashboard-services.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { 
    CardAssemblyResponse, 
    TopProductsResponse, 
    ChartDataResponse, 
    ChartData, 
    TopProductsItem, 
    ReferenceSearchResponse,
    ProductionNewsResponse // 💡 AJUSTE: Importamos la nueva interfaz de respuesta
} from '../interfaces/assembly.interface'; 
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DashboardServices {

  private http = inject(HttpClient);
  private readonly BASE_URL = environment.backendUrl;
  private readonly BASE_API = environment.api;
  private readonly CARD_METRICS_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/assembly/cardAssembly`;
  private readonly TOP_PRODUCTION_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/assembly/topProducts`;
  private readonly TOTAL_PRODUCTION_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/assembly/totalProductsDay`;
  private readonly VIEW_REF_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/assembly/viewRef`;
  private readonly VIEW_NEWS_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/assembly/viewNews`; // Este usamos

  private handleError(error: any) {
    let errorMessage = 'Ocurrió un error desconocido en el servicio.';
    if (error.error && error.error.msg) {
      errorMessage = error.error.msg;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return throwError(() => new Error(`Falló la consulta al backend: ${errorMessage}`));
  }

  getCardMetrics(date: string): Observable<CardAssemblyResponse> {
    // ... (este método no cambia)
    const body = { date };
    return this.http.post<CardAssemblyResponse>(this.CARD_METRICS_ENDPOINT, body)
      .pipe(catchError(this.handleError.bind(this)));
  }

  private getTopProduction(date: string): Observable<TopProductsResponse> {
    // ... (este método no cambia)
    const body = { date };
    return this.http.post<TopProductsResponse>(this.TOP_PRODUCTION_ENDPOINT, body)
      .pipe(catchError(this.handleError.bind(this)));
  }

  getTopProductsChartData(date: string): Observable<ChartDataResponse> {
    // ... (este método no cambia)
    return this.getTopProduction(date).pipe(
      map(response => {
        if (!response.ok || !response.msg || response.msg.length === 0) {
          return {
            ok: false,
            msg: { categories: [], produced: [], valid: [] }
          };
        }
        const chartData: ChartData = response.msg.reduce(
          (acc: ChartData, product) => {
            acc.categories.push(`${product.productName.trim()}`); 
            acc.produced.push(product.Producidos);
            acc.valid.push(product.Validos);
            return acc;
          },
          { categories: [], produced: [], valid: [] } 
        );
        return {
          ok: true,
          msg: chartData
        };
      })
    );
  }

  getTotalProductsDay(date: string, timeStart?: string, timeEnd?: string): Observable<TopProductsResponse> {
    // ... (este método no cambia)
    const body: any = { date };
    if (timeStart) body.timeStart = timeStart;
    if (timeEnd) body.timeEnd = timeEnd;

    return this.http.post<TopProductsResponse>(this.TOTAL_PRODUCTION_ENDPOINT, body)
      .pipe(
        catchError(this.handleError.bind(this)),
        map(response => {
          if (!response.msg) {
            return { ok: response.ok, msg: [] as TopProductsItem[] };
          }
          return response;
        })
      );
  }

  searchReferences(referenceTerm: string): Observable<ReferenceSearchResponse> {
    // ... (este método no cambia)
    const body = { reference: referenceTerm };
    return this.http.post<ReferenceSearchResponse>(this.VIEW_REF_ENDPOINT, body)
      .pipe(
        catchError(this.handleError.bind(this)),
        map(response => {
          if (!response.msg) {
            return { ok: response.ok, msg: [] };
          }
          return response;
        })
      );
  } 

  // --- 👇 AQUÍ ESTÁ EL MÉTODO ACTUALIZADO 👇 ---

  /**
   * @description Obtiene todas las novedades de producción para una fecha específica.
   * @param {string} date - La fecha de consulta en formato 'DD/MM/YYYY'.
   * @returns {Observable<ProductionNewsResponse>} - Respuesta del backend con la lista de novedades.
   */
  viewNews(date: string): Observable<ProductionNewsResponse> {
      // 💡 AJUSTE: El body ahora es { "date": "..." }
      const body = { date };

      // 💡 AJUSTE: El tipo de respuesta esperado es <ProductionNewsResponse>
      return this.http.post<ProductionNewsResponse>(this.VIEW_NEWS_ENDPOINT, body)
          .pipe(
              catchError(this.handleError.bind(this)),
              map(response => {
                  if (!response.msg) {
                      // Si el backend dice 'ok' pero 'msg' está vacío o null,
                      // devolvemos un array vacío para evitar errores en el componente.
                      return { ok: response.ok, msg: [] };
                  }
                  return response;
              })
          );
  } 
}