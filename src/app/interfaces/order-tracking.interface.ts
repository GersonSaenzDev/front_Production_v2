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
  // Campos opcionales que vienen en el JSON
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
  transporter?: string;
  vehiclePlate?: string;
  guideNumber?: string;
  deliveredSerial?: string; // Lo capturamos como string y luego lo procesamos
  userUpdated: string;
  note: string;
}

export interface DeliveryStatus {
  value: string;
  label: string;
  color: string;
  icon: string;
}
