// app/engineering/structure-managements/shared/work-config.defaults.ts
import { WarehouseStaffMap, WorkSchedule } from '../../../interfaces/product-structure.interface';

/** Fila editable del mapeo bodega→departamento (los departamentos van separados por coma). */
export interface WarehouseStaffRow {
  warehouseCode: string;
  departments: string;
}

/** Jornadas de trabajo reales de la planta, usadas como valor inicial editable. */
export const DEFAULT_WORK_SCHEDULES: WorkSchedule[] = [
  {
    name: 'Ensamble (2 turnos)',
    warehouses: ['ED', 'EA', 'SE'],
    shifts: [
      { start: '06:00', end: '13:00' },
      { start: '13:00', end: '20:00' }
    ],
    breakMinutes: 20,
    daysPerWeek: 6
  },
  {
    name: 'Planta (2 turnos)',
    default: true,
    shifts: [
      { start: '06:00', end: '13:00' },
      { start: '13:00', end: '20:00' }
    ],
    breakMinutes: 20,
    daysPerWeek: 6
  }
];

/** Área de personal por defecto para el cruce con la nómina. */
export const DEFAULT_STAFF_AREA = 'PRODUCCION';

/** Mapeo real bodega→departamento(s) de personal, usado como valor inicial editable. */
export const DEFAULT_WAREHOUSE_STAFF_MAP: WarehouseStaffMap = {
  PH: 'HIDRAULICAS',
  PD: 'DOBLADORAS',
  PT: 'TROQUELADORAS',
  C2: 'CORTE',
  WP: 'PARRILLAS',
  WV: 'VIDRIOS',
  WT: 'TUB-COND-CUAL',
  WI: 'INYECCION',
  MV: 'MECANIZADO VARIOS',
  FL: 'FUNDICION',
  FA: 'FUNDICION',
  CE: 'CONJUNTOS ELECTRICOS',
  NP: 'PULIMENTO CROMADO',
  MS: 'MECANIZADO VALVULAS',
  ED: ['ENSAMBLE USA', 'SUB-ENSAMBLES USA'],
  SE: ['SUB-ENSAMBLES USA']
};

/** Convierte el diccionario bodega→departamento(s) en filas editables para una tabla. */
export function warehouseStaffMapToRows(map: WarehouseStaffMap): WarehouseStaffRow[] {
  return Object.entries(map).map(([warehouseCode, departments]) => ({
    warehouseCode,
    departments: Array.isArray(departments) ? departments.join(', ') : departments
  }));
}

/** Convierte las filas editables de vuelta al diccionario bodega→departamento(s) esperado por el backend. */
export function rowsToWarehouseStaffMap(rows: WarehouseStaffRow[]): WarehouseStaffMap {
  const map: WarehouseStaffMap = {};
  for (const row of rows) {
    const code = row.warehouseCode.trim().toUpperCase();
    if (!code) continue;
    const departments = row.departments
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    if (departments.length === 0) continue;
    map[code] = departments.length === 1 ? departments[0] : departments;
  }
  return map;
}
