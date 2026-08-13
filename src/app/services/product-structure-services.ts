/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/services/product-structure-services.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
  CapacityAnalysisPayload,
  CapacityAnalysisResponse,
  CostAuditPayload,
  CostAuditResponse,
  MaterialsAnalysisPayload,
  MaterialsAnalysisResponse,
  ProductStructureDetailResponse,
  ProductStructureListResponse,
  ProductStructureUploadResponse,
  ProductionOptimizationPayload,
  ProductionOptimizationResponse,
  ReferenceAnalysisPayload,
  ReferenceAnalysisResponse,
  ReferenceAuditDetailPayload,
  ReferenceAuditDetailResponse,
  ReferenceAuditPayload,
  ReferenceAuditResponse,
  ScenarioPayload,
  ScenarioResponse
} from '../interfaces/product-structure.interface';

@Injectable({
  providedIn: 'root'
})
export class ProductStructureServices {
  private http = inject(HttpClient);
  private readonly BASE_URL = environment.backendUrl;
  private readonly BASE_API = environment.api;
  private readonly BASE_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/plannig/productStructure`;
  private readonly LIST_ENDPOINT = `${this.BASE_ENDPOINT}/list`;
  private readonly DETAIL_ENDPOINT = `${this.BASE_ENDPOINT}/detail`;
  private readonly MATERIALS_ENDPOINT = `${this.BASE_ENDPOINT}/materials`;
  // Endpoint aún no confirmado por el backend; se sigue el patrón de cargue de planning.
  private readonly UPLOAD_ENDPOINT = `${this.BASE_ENDPOINT}/upload`;
  private readonly SCENARIO_ENDPOINT = `${this.BASE_ENDPOINT}/scenario`;
  private readonly ANALYSIS_ENDPOINT = `${this.BASE_ENDPOINT}/analysis`;
  private readonly CAPACITY_ENDPOINT = `${this.BASE_ENDPOINT}/capacity`;
  private readonly OPTIMIZATION_ENDPOINT = `${this.BASE_ENDPOINT}/optimization`;
  private readonly AUDIT_ENDPOINT = `${this.BASE_ENDPOINT}/audit`;
  private readonly AUDIT_DETAIL_ENDPOINT = `${this.BASE_ENDPOINT}/auditDetail`;
  private readonly COST_AUDIT_ENDPOINT = `${this.BASE_ENDPOINT}/costAudit`;

  // El header `x-token` lo agrega automáticamente el authInterceptor para
  // cualquier petición al backend, por lo que no se setea manualmente aquí.

  private handleError(error: any) {
    if (error?.error?.msg) {
      return throwError(() => new Error(error.error.msg));
    }
    const fallback = error?.message || 'Ocurrió un error desconocido en el servicio.';
    return throwError(() => new Error(`Falló la consulta al backend: ${fallback}`));
  }

  /**
   * @description Lista las estructuras de producto cargadas (POST /plannig/productStructure/list).
   * @returns {Observable<ProductStructureListResponse>}
   */
  listProductStructures(): Observable<ProductStructureListResponse> {
    return this.http
      .post<ProductStructureListResponse>(this.LIST_ENDPOINT, {})
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Obtiene el detalle (BOM) de una estructura por su código interno (POST /plannig/productStructure/detail).
   * @param {string} internalCode - Código interno de la referencia.
   * @returns {Observable<ProductStructureDetailResponse>}
   */
  getProductStructureDetail(internalCode: string): Observable<ProductStructureDetailResponse> {
    return this.http
      .post<ProductStructureDetailResponse>(this.DETAIL_ENDPOINT, { internalCode })
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Ejecuta el análisis de materiales sobre 1..N referencias (POST /plannig/productStructure/materials).
   * @param {MaterialsAnalysisPayload} payload - Referencias y cantidades a analizar.
   * @returns {Observable<MaterialsAnalysisResponse>}
   */
  analyzeMaterials(payload: MaterialsAnalysisPayload): Observable<MaterialsAnalysisResponse> {
    return this.http
      .post<MaterialsAnalysisResponse>(this.MATERIALS_ENDPOINT, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Carga el archivo de estructura de producto (POST /plannig/productStructure/upload).
   * Endpoint aún no confirmado por el backend; ajustar campo/URL cuando se defina el contrato real.
   * @param {File} structureFile - Archivo Excel con la estructura a cargar.
   * @returns {Observable<ProductStructureUploadResponse>}
   */
  uploadProductStructure(structureFile: File): Observable<ProductStructureUploadResponse> {
    const formData = new FormData();
    formData.append('structureFile', structureFile);

    return this.http
      .post<ProductStructureUploadResponse>(this.UPLOAD_ENDPOINT, formData)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Calcula el escenario de requerimientos (tiempos, costos y cuellos de botella) para 1..N
   * referencias (POST /plannig/productStructure/scenario).
   * @param {ScenarioPayload} payload - Referencias con cantidad y horas disponibles por día.
   * @returns {Observable<ScenarioResponse>}
   */
  calculateScenario(payload: ScenarioPayload): Observable<ScenarioResponse> {
    return this.http
      .post<ScenarioResponse>(this.SCENARIO_ENDPOINT, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Ejecuta el análisis profundo de una referencia: costo industrial y flujo por bodega
   * (POST /plannig/productStructure/analysis).
   * @param {ReferenceAnalysisPayload} payload - Referencia, cantidad planeada y materiales opcionales a filtrar.
   * @returns {Observable<ReferenceAnalysisResponse>}
   */
  analyzeReference(payload: ReferenceAnalysisPayload): Observable<ReferenceAnalysisResponse> {
    return this.http
      .post<ReferenceAnalysisResponse>(this.ANALYSIS_ENDPOINT, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Analiza la capacidad de planta (personal disponible vs. horas-hombre requeridas) para
   * 1..N referencias (POST /plannig/productStructure/capacity).
   *
   * Exportación/Nacional automático: para las bodegas ED ("ENSAMBLE EXPORTACIONES") y SE
   * ("SUB-ENSAMBLES"), el backend ya separa el personal según el tipo de cada referencia
   * (internalCode inicia en "7" = Exportación; cualquier otro dígito = Nacional) sin que haga
   * falta enviar nada especial en `warehouseStaffMap` — el resultado trae la bodega partida en
   * dos filas de `byWarehouse` (`warehouseCode` "ED-EXPORT" / "ED-NATIONAL"). Si se envía
   * `warehouseStaffMap`/`warehousePeopleOverride` para esa bodega puntual, ese override manda y
   * NO se parte. Ver `CapacityWarehouseLoad` para el detalle de campos (incluye `staff: null` +
   * `reason` cuando el departamento de RH correspondiente aún no existe).
   * @param {CapacityAnalysisPayload} payload - Referencias, jornadas de trabajo y mapeo bodega→departamento.
   * @returns {Observable<CapacityAnalysisResponse>}
   */
  analyzeCapacity(payload: CapacityAnalysisPayload): Observable<CapacityAnalysisResponse> {
    return this.http
      .post<CapacityAnalysisResponse>(this.CAPACITY_ENDPOINT, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Calcula la mezcla óptima de producción sujeta a la capacidad de planta
   * (POST /plannig/productStructure/optimization).
   *
   * Mismo split automático Exportación/Nacional que `analyzeCapacity` para ED/SE: cada bodega
   * entra al modelo (Simplex) como dos secciones independientes ("ED-EXPORT"/"ED-NATIONAL"),
   * cada referencia solo carga la sección de su propio tipo. Las secciones sin personal cruzado
   * (ej. "SE-EXPORT" mientras RH no tenga el departamento "SUB-ENSAMBLES USA") llegan en
   * `excludedSections`, no en `sections`.
   * @param {ProductionOptimizationPayload} payload - Referencias, jornadas de trabajo y mapeo bodega→departamento.
   * @returns {Observable<ProductionOptimizationResponse>}
   */
  optimizeProduction(payload: ProductionOptimizationPayload): Observable<ProductionOptimizationResponse> {
    return this.http
      .post<ProductionOptimizationResponse>(this.OPTIMIZATION_ENDPOINT, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Audita una referencia con trazabilidad directa al Excel master: consolida materiales por
   * unidad de medida (`byUnit`) y prueba el costo oficial línea por línea de nivel 1 con `rolledCost`/`gap`
   * junto al precio propio (POST /plannig/productStructure/audit).
   * @param {ReferenceAuditPayload} payload - Referencia y cantidad planeada.
   * @returns {Observable<ReferenceAuditResponse>}
   */
  auditReference(payload: ReferenceAuditPayload): Observable<ReferenceAuditResponse> {
    return this.http
      .post<ReferenceAuditResponse>(this.AUDIT_ENDPOINT, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Detalle de auditoría de una referencia: reconciliación matemática exacta entre la
   * explosión completa de materia prima y el costo oficial, diagnóstico línea por línea de nivel 1 y el
   * listado completo de `deepGaps` (nodos con precio desactualizado a cualquier profundidad, con su `path`)
   * (POST /plannig/productStructure/auditDetail).
   * @param {ReferenceAuditDetailPayload} payload - Referencia y cantidad planeada.
   * @returns {Observable<ReferenceAuditDetailResponse>}
   */
  auditReferenceDetail(payload: ReferenceAuditDetailPayload): Observable<ReferenceAuditDetailResponse> {
    return this.http
      .post<ReferenceAuditDetailResponse>(this.AUDIT_DETAIL_ENDPOINT, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Auditoría de costos consolidada sobre todas las referencias cargadas, priorizada por
   * `priceStalenessGap` (POST /plannig/productStructure/costAudit).
   * @param {CostAuditPayload} [payload] - Filtros opcionales (prefijos a excluir, solo desajustes, diferencia mínima).
   * @returns {Observable<CostAuditResponse>}
   */
  auditCosts(payload: CostAuditPayload = {}): Observable<CostAuditResponse> {
    return this.http
      .post<CostAuditResponse>(this.COST_AUDIT_ENDPOINT, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }
}
