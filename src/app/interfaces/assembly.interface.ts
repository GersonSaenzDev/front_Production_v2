// src/app/core/interfaces/assembly.interface.ts

// Interfaz para la respuesta de las tarjetas (ya la tenías)
export interface AssemblyMetrics {
  TotalReadingsRecorded: number;
  TotalValidUnits: number;
  TotalErrorMarked: number;
  TotalDuplicated: number;
}

export interface CardAssemblyResponse {
  ok: boolean;
  msg: AssemblyMetrics;
}

// NUEVO: Interfaz para un solo producto de la respuesta del backend
export interface ProductData {
  productCode: string;
  productName: string;
  Producidos: number; // La P y la V son mayúsculas, como en tu JSON
  Validos: number;
}

// NUEVO: Interfaz para la respuesta completa de la API de top products
export interface TopProductsResponse {
  ok: boolean;
  msg: ProductData[]; // Es un array de ProductData
}

// NUEVO: La estructura que necesita el gráfico ApexCharts
export interface ChartData {
  categories: string[];
  produced: number[];
  valid: number[];
}

// NUEVO: La estructura que el servicio le entregará al componente
export interface ChartDataResponse {
  ok: boolean;
  msg: ChartData;
}

// Interfaz para las tarjetas (ya la tenías)
export interface Card {
  background: string;
  title: string;
  icon: string;
  text: string;
  number: string;
  no: string;
}

export interface TopProductsItem {
    productCode: string;
    productName: string;
    Producidos: number; // Total de unidades producidas (con y sin error)
    Validos: number;    // Total de unidades sin error
}

// Interfaz para cada item de referencia del producto
export interface ReferenceItem {
    EAN: string;
    productCode: string;
    productName: string;
    reference: string;
}

// Interfaz para la respuesta completa del backend
export interface ReferenceSearchResponse {
    ok: boolean;
    msg: ReferenceItem[]; // El array de resultados
}
