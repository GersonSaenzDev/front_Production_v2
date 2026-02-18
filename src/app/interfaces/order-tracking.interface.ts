// src/app/interfaces/order-tracking.interface.ts

export interface OrderTracking {
  _id: string;
  store: string;
  storePurchaseOrder: string;
  ean: string;
  address: string;
  city: string;
  clientIdentification: string;
  clientName: string;
  dateUpdated: string;
  deliveryStatus: string;
  fileReceptionDate: string;
  observations: any[];
  phones: string;
  quantity: number;
  reference: string;
  status: string;
  storeNumber: string;
  userUpdated: string;
  validationAutomatically: boolean;

  // --- NUEVOS CAMPOS DE LOGÍSTICA (ARRAYS PARA HISTORIAL) ---
  guideNumber?: string[];        // Array de guías
  transporter?: string[];        // Array de transportadoras
  vehiclePlate?: string[];       // Array de placas
  shippingCost?: string[];       // Array de costos
  warehouseExitDate?: string[];  // Array de fechas de salida
  
  // Observaciones estructuradas
  processControlObservations?: ObservationItem[];
  dispatchOfObservations?: ObservationItem[];

  // Otros campos opcionales
  saleDate?: string;
  saleValue?: number;
  cost?: number;
  induselPurchaseOrder?: string;
  induselOrder?: string;
  codRef?: string;
  plu?: string;
  __v?: number;
}

export interface OrderTrackingResponse {
  ok: boolean;
  msg: string;
  count: number;
  data: OrderTracking[]; // Ahora 'data' usa la interfaz completa
}

// Interfaz para la respuesta de carga de archivos
export interface OrderLoadingResponse {
  ok: boolean;
  msg: string;
  originalFile: string;
  processedData: {
    ok: boolean;
    msg: string;
    errors: string[];
  };
}

export interface FlowData {
  status: string;
  deliveryStatus: string;
  transporter?: string;
  vehiclePlate?: string;
  guideNumber?: string;
  deliveredSerial?: string; // Lo capturamos como string y luego lo procesamos
  userUpdated: string;
  note: string;
  // --- AGREGA ESTOS CAMPOS NUEVOS ---
  induselOrder?: string;
  induselPurchaseOrder?: string;
  warehouseDispatchId?: string;
  warehouseExitDate?: string;
  dispatchObservations?: string;

  shippingCost: string;
  processNote: string;
  dispatchNote: string;
}

export interface DeliveryStatus {
  value: string;
  label: string;
  color: string;
  icon: string;
  
}

// Estructura para las notas/observaciones
export interface ObservationItem {
    note: string;
    userUpdated: string;
    dateUpdated: string;
    _id?: string; // El backend lo genera automáticamente
}

// Payload que enviamos al servidor
export interface OrderUpdatePayload {
    id: string;
    deliveryStatus: string;
    userUpdated: string;
    induselOrder: string;
    warehouseDispatchId: string;
    warehouseExitDate: string;
    address: string;
    transporter: string;
    vehiclePlate: string;
    guideNumber: string;
    shippingCost: string;
    newWarehouseExitDate: string;
    deliveredSerial: string[];
    processControlObservations: ObservationItem[];
    dispatchOfObservations: ObservationItem[];
}

// Estructura de la respuesta del servidor (Response)
export interface OrderUpdateResponse {
    ok: boolean;
    msg: string;
    data: any; // Aquí vendría el objeto OrderTracking completo actualizado
}
