// src/app/production/production-subareas.config.ts
//
// Fuente única de verdad para las áreas de Producción que se dividen en subáreas.
// La usan: el routing (genera rutas), la navegación (genera el menú anidado)
// y el control de acceso (menu-access.service).
//
// Notas de nombres:
// - `area` es el nombre REAL guardado/consultado en el backend (no el visual).
//     Crudo    -> 'Prensas'
//     Acabados -> 'Recubrimientos'
//     Satélites-> 'Satélites'
//   (la traducción visual Prensas→Crudo / Recubrimientos→Acabados vive en area-display.util)
// - `subArea` debe coincidir EXACTAMENTE con el valor almacenado en las novedades
//   (origin.subArea / assignment.currentSubArea) para que el filtro funcione.
// - `dept` es el departamento del usuario (en MAYÚSCULAS) usado por el control de acceso
//   para mostrar SOLO su subárea. Por defecto = subArea en mayúsculas.

export interface ProductionSubAreaDef {
  /** Slug para la ruta, ej. 'troqueladoras'. */
  key: string;
  /** Etiqueta visible en el menú, ej. 'Troqueladoras'. */
  label: string;
  /** Valor exacto almacenado en la novedad para filtrar. */
  subArea: string;
  /** Departamento (MAYÚSCULAS) del usuario que pertenece a esta subárea. Default: subArea.toUpperCase(). */
  dept?: string;
}

export interface ProductionAreaDef {
  /** Slug para la ruta, ej. 'crudo'. */
  key: string;
  /** Etiqueta visible en el menú, ej. 'Crudo'. */
  label: string;
  /** Nombre REAL del área en el backend, ej. 'Prensas'. */
  area: string;
  /** Icono Tabler para el colapso padre. */
  icon: string;
  subAreas: ProductionSubAreaDef[];
}

export const PRODUCTION_AREAS: ProductionAreaDef[] = [
  {
    key: 'crudo',
    label: 'Crudo',
    area: 'Prensas',
    icon: 'ti ti-layout-bottombar',
    subAreas: [
      { key: 'arsol', label: 'Arsol', subArea: 'Arsol' },
      { key: 'corte', label: 'Corte', subArea: 'Corte' },
      { key: 'dobladoras', label: 'Dobladoras', subArea: 'Dobladoras' },
      { key: 'hidraulicas', label: 'Hidraulicas', subArea: 'Hidraulicas' },
      { key: 'parrillas', label: 'Parrillas', subArea: 'Parrillas' },
      { key: 'pulimento-cromado', label: 'Pulimento Cromado', subArea: 'Pulimento Cromado' },
      { key: 'troqueladoras', label: 'Troqueladoras', subArea: 'Troqueladoras' },
      { key: 'tuberias', label: 'Tuberias', subArea: 'Tuberias' }
    ]
  },
  {
    key: 'acabados',
    label: 'Acabados',
    area: 'Recubrimientos',
    icon: 'ti ti-color-swatch',
    subAreas: [
      // OJO: confirmar el `subArea` exacto contra la colección productionAreas de Acabados.
      { key: 'pintura', label: 'Pintura', subArea: 'Pintura', dept: 'ACABADOS PINTURA' },
      { key: 'esmalte', label: 'Esmalte', subArea: 'Esmalte', dept: 'ACABADOS ESMALTE' }
    ]
  },
  {
    key: 'satelites',
    label: 'Satélites',
    area: 'Satélites',
    icon: 'ti ti-satellite',
    subAreas: [
      { key: 'conjuntos-electricos', label: 'Conjuntos Electricos', subArea: 'Conjuntos Electricos' },
      { key: 'fundicion', label: 'Fundicion', subArea: 'Fundicion' },
      { key: 'fundicion-aluminio', label: 'Fundicion Aluminio', subArea: 'Fundicion Aluminio' },
      { key: 'inyeccion', label: 'Inyeccion', subArea: 'Inyeccion' },
      { key: 'mecanizado-valvulas', label: 'Mecanizado Valvulas', subArea: 'Mecanizado Valvulas' },
      { key: 'mecanizado-varios', label: 'Mecanizado Varios', subArea: 'Mecanizado Varios' },
      { key: 'resistencias', label: 'Resistencias', subArea: 'Resistencias' },
      { key: 'tub-cond-cual', label: 'Tub-Cond-Cual', subArea: 'Tub-Cond-Cual' }
    ]
  }
];

/** Departamento efectivo de una subárea (override `dept` o subArea en mayúsculas). */
export function subAreaDept(sub: ProductionSubAreaDef): string {
  return (sub.dept ?? sub.subArea).toUpperCase().trim();
}
