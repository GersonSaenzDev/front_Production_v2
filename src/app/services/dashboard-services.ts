// src/app/services/dashboard-services.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
// 💡 AJUSTE: Ahora importamos TopProductsItem correctamente.
import { 
    CardAssemblyResponse, 
    TopProductsResponse, 
    ChartDataResponse, 
    ChartData, 
    TopProductsItem 
} from '../interfaces/assembly.interface'; 
import { environment } from 'src/environments/environment';

@Injectable({
providedIn: 'root'
})
export class DashboardServices {

private http = inject(HttpClient);
private readonly BASE_URL = environment.backendUrl;
private readonly CARD_METRICS_ENDPOINT = `${this.BASE_URL}/api/v1/assembly/cardAssembly`;
private readonly TOP_PRODUCTION_ENDPOINT = `${this.BASE_URL}/api/v1/assembly/topProducts`;
private readonly TOTAL_PRODUCTION_ENDPOINT = `${this.BASE_URL}/api/v1/assembly/totalProductsDay`; 

private handleError(error: any) {
 console.error('DashboardServices: Error en la petición:', error);
 let errorMessage = 'Ocurrió un error desconocido en el servicio.';
 if (error.error && error.error.msg) {
 errorMessage = error.error.msg;
 } else if (error.message) {
 errorMessage = error.message;
 }
 return throwError(() => new Error(`Falló la consulta al backend: ${errorMessage}`));
}

getCardMetrics(date: string): Observable<CardAssemblyResponse> {
 const body = { date };
 return this.http.post<CardAssemblyResponse>(this.CARD_METRICS_ENDPOINT, body)
 .pipe(catchError(this.handleError.bind(this)));
}

private getTopProduction(date: string): Observable<TopProductsResponse> {
 const body = { date };
 return this.http.post<TopProductsResponse>(this.TOP_PRODUCTION_ENDPOINT, body)
 .pipe(catchError(this.handleError.bind(this)));
}

/**
* @description Obtiene los datos de producción y los transforma para el gráfico (Top 10).
* @param {string} date - La fecha en formato 'DD/MM/YYYY'.
* @returns {Observable<ChartDataResponse>}
*/
getTopProductsChartData(date: string): Observable<ChartDataResponse> {
return this.getTopProduction(date).pipe(
 map(response => {
 
 console.log('Respuesta CRUDA del backend (getTopProduction):', response);

 if (!response.ok || !response.msg || response.msg.length === 0) {
  console.warn('Backend respondió sin datos válidos. Se devuelve estructura vacía.');
  return {
  ok: false,
  msg: { categories: [], produced: [], valid: [] }
  };
 }

 // 3. Transforma el array de objetos en el objeto que el gráfico necesita
 const chartData: ChartData = response.msg.reduce(
  (acc: ChartData, product) => {
      // Concatenar Código + Nombre para una mejor etiqueta en el eje X
  acc.categories.push(`${product.productName.trim()}`); 
  acc.produced.push(product.Producidos);
  acc.valid.push(product.Validos);
  return acc;
  },
  { categories: [], produced: [], valid: [] } 
 );

 console.log('Datos TRANSFORMADOS para el gráfico:', chartData);

 // 4. Devuelve la nueva estructura de datos transformada
 return {
  ok: true,
  msg: chartData
 };
 })
);
}

/**
* @description Obtiene el total de productos del día, opcionalmente filtrado por rango horario.
* @param {string} date - La fecha en formato 'DD/MM/YYYY'.
* @param {string} [timeStart] - Hora de inicio en formato 'HH:MM'.
* @param {string} [timeEnd] - Hora de fin en formato 'HH:MM'.
* @returns {Observable<TopProductsResponse>} - Devuelve el arreglo completo de productos agregados.
*/
getTotalProductsDay(date: string, timeStart?: string, timeEnd?: string): Observable<TopProductsResponse> {
    
  const body: any = { date };
      if (timeStart) body.timeStart = timeStart;
      if (timeEnd) body.timeEnd = timeEnd;

      // 🚨 PUNTO DE CONTROL 1: Petición saliente
      console.log('SERVICIOS - CONTROL: Petición a totalProductsDay con body:', body);
      
  return this.http.post<TopProductsResponse>(this.TOTAL_PRODUCTION_ENDPOINT, body)
    .pipe(
          catchError(this.handleError.bind(this)),
          map(response => {
              // 🚨 PUNTO DE CONTROL 2: Respuesta del backend
              console.log('SERVICIOS - CONTROL: Respuesta del backend (totalProductsDay):', response);

              if (!response.msg) {
                  return { ok: response.ok, msg: [] as TopProductsItem[] };
              }
              return response;
          })
      );
  }
}