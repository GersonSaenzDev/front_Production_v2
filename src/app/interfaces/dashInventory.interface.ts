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

