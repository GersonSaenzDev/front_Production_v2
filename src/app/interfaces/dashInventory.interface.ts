// src/app/core/interfaces/dashInventory.interface.ts

export interface SeeGroupsResponse {
  ok: boolean;
  msg: {
    ok: boolean;
    msg: string;
    totalRecords: number;
    totalGroups: number;
    data: {
      area: string;
      persons: string[];
      count: number;
    }[];
  };
}

export interface ConfirmedCountItem {
  total: number;
  validatedTrueItems: {
    code: string;
    codRef: number;
    referencia: string;
    producto: string;
  }[];
  validatedFalseItems: {
    code: string;
    codRef: number;
    referencia: string;
    producto: string;
  }[];
  validatedTrue: number;
  validatedFalse: number;
  area: string;
  persons: string[];
  team: string;
}

export interface ConfirmedCountResponse {
  ok: boolean;
  msg: ConfirmedCountItem[];
}

export interface DuplicatesData {
  areas: string[];
  totalAreas: number;
  code: string;
}

export interface DuplicatesResponse {
  ok: boolean;
  msg: {
    ok: boolean;
    msg: string;
    data: DuplicatesData[];
  };
}

export interface GlobalCountData {
  total: number;
  validatedTrue: number;
  validatedFalse: number;
}

export interface GlobalCountResponse {
  ok: boolean;
  msg: GlobalCountData;   // <-- msg es un objeto, NO un array ni un objeto con msg interno
}

export interface TeamCountData {
  totalTeams: number;
}

export interface TeamCountResponse {
  ok: boolean;
  msg: TeamCountData;   // <-- msg es un objeto, NO un array ni un objeto con msg interno
}

export interface AreaCountData {
  totalAreas: number;
}

export interface AreaCountResponse {
  ok: boolean;
  msg: AreaCountData;   // <-- msg es un objeto, NO un array ni un objeto con msg interno
}

export interface InventoryItem {
  code: string;
  codRef: number;
  referencia: string;
  producto: string;
  area: string;
  persons: string[];
  team: string;
  validate: boolean;
  dateCreate: string;
}

export interface ViewInventoriesData {
  total: number;
  items: InventoryItem[];
}

export interface ViewInventoriesResponse {
  ok: boolean;
  msg: ViewInventoriesData;
}

export interface TeamCode {
  code: string;
  totalOccurrences: number;
  codRef?: number;
  referencia?: string;
  producto?: string;
}

export interface TeamItemsData {
  area: string;
  total: number;
  codes: TeamCode[];
}

export interface TeamItemsResponse {
  ok: boolean;
  msg: TeamItemsData;
}

export interface NotCompliantItem {
  _id: string;
  area: string;
  persons: string[];      // nombres de las personas (strings)
  team: string;           // puede ser cadena vacía
  code: string;           // barcode.code
  codRef: number;         // inventory.codRef
  referencia: string;
  producto: string;
  validate: boolean;
}

export interface NotCompliantData {
  total: number;
  totalPages: number;
  currentPage: number;
  items: NotCompliantItem[];
}

export interface NotCompliantResponse {
  ok: boolean;
  msg: NotCompliantData;
}

// Request que envías al backend
export interface AuditNoteRequest {
  barcode: string;
  reference?: string;
  area?: string;
  note?: string;
  date?: string; // opcional
}

// Respuesta simple (mensaje)
export interface AuditNoteResponseSimple {
  ok: boolean;
  msg: string;
}

// Respuesta con item actualizado en msg
export interface AuditNoteItemResponse {
  _id: string;
  area: string;
  persons: string[];
  team: string;
  code: string;
  codRef: number;
  referencia: string;
  producto: string;
  validate: boolean;
  annotation?: string;
  note?: string;
}

export interface AuditNoteResponseWithItem {
  ok: boolean;
  msg: AuditNoteItemResponse;
}

// Union para el servicio
export type AuditNoteResponse = AuditNoteResponseSimple | AuditNoteResponseWithItem;

// Ajustar NotCompliantItem (agregar annotation y note opcionales)
export interface NotCompliantItem {
  _id: string;
  area: string;
  persons: string[];      // nombres de las personas (strings)
  team: string;           // puede ser cadena vacía
  code: string;           // barcode.code
  codRef: number;         // inventory.codRef
  referencia: string;
  producto: string;
  validate: boolean;
  annotation?: string;    // <-- opcional
  note?: string;          // <-- opcional (si el backend usa esta propiedad)
}

export interface AuditNoteItem {
  _id: string;
  area: string;
  persons: string[];
  team: string;
  code: string;
  codRef: number;
  referencia: string;
  producto: string;
  validate: boolean;
  annotation?: string;
  note?: string;
}
export interface StorageItem {
  EAN: string;
  productCode: string;
  productName: string;
  reference: string;
  barcode: string;
  consecutivo: string;
}

export interface StorageResponse {
  ok: boolean;
  msg: StorageItem[]; // el backend devuelve un array de objetos (puede ser de longitud 0 o más)
}

export interface BarcodeRequest {
  barcode: string;
}

export interface Product {
  EAN: string;
  productCode: string;
  productName: string;
  reference: string;
  barcode: string;
  consecutivo: string;
}

export interface InsertInventoryRequest {
  inventoryStaff: {
    area: string;
    persons: { Person1: string; Person2: string }[];
  };
  inventory: {
    barcode: string[];
    producto: string;
    referencia: string;
    codRef: string;
    consecutive: string[];
    validate: boolean;
  };
}

export interface InsertInventoryResponse {
  ok: boolean;
  msg: string;
}

