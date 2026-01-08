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
import { InventoryGroup, InventoryReportResponse } from '../interfaces/dashInventory.interface';

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
  private readonly VIEW_NEWS_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/assembly/viewNews`;
  private readonly TOTAL_PRODUCTION_HOURS_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/assembly/totalProductsDayHours`;
  private readonly FINAL_INVENTORY_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/storage/finalInventoryReport`;


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

  /**
   * @description Obtiene el total de productos y su desglose por horas.
   * @param {string} date - Fecha en formato DD/MM/YYYY.
   * @param {string} timeStart - Hora de inicio (HH:MM).
   * @param {string} timeEnd - Hora de fin (HH:MM).
   */
  getTotalProductsDayHours(date: string, timeStart: string, timeEnd: string): Observable<TopProductsResponse> {
    
    // Construimos el body exactamente como lo pide el ejemplo JSON
    const body = { 
        date: date,
        timeStart: timeStart,
        timeEnd: timeEnd
    };

    // Usamos el nuevo endpoint TOTAL_PRODUCTION_HOURS_ENDPOINT
    return this.http.post<TopProductsResponse>(this.TOTAL_PRODUCTION_HOURS_ENDPOINT, body)
      .pipe(
        catchError(this.handleError.bind(this)),
        map(response => {
          // Validación de seguridad por si msg viene null
          if (!response.msg) {
            return { ok: response.ok, msg: [] as TopProductsItem[] };
          }
          return response;
        })
      );
  }

  /**
   * @description Obtiene el reporte final de inventario entre dos fechas.
   * @param {string} dateIni - Fecha inicio 'DD/MM/YYYY'
   * @param {string} dateEnd - Fecha fin 'DD/MM/YYYY'
   */
  getFinalInventoryReport(dateIni: string, dateEnd: string): Observable<InventoryReportResponse> {
    
    const body = { dateIni, dateEnd };

    return this.http.post<InventoryReportResponse>(this.FINAL_INVENTORY_ENDPOINT, body)
      .pipe(
        catchError(this.handleError.bind(this)),
        map(response => {
          // Si por alguna razón data viene null o undefined, inicializamos array vacío
          if (!response.data) {
            return { ...response, data: [] as InventoryGroup[] };
          }
          return response;
        })
      );
  }
}