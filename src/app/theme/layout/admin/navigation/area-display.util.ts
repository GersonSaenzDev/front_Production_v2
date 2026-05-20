// src/app/theme/layout/admin/navigation/area-display.util.ts
//
// Traducción SOLO visual de nombres de área de producción.
// La CLAVE es el nombre real que se guarda/consulta en el backend (no cambia);
// el VALOR es únicamente la etiqueta que ve el usuario en pantalla.
//
// Esto NO modifica la lógica ni los datos: las novedades se siguen guardando y
// filtrando con el nombre real. Solo cambia cómo se muestra en el formulario y la vista.
export const AREA_DISPLAY_MAP: Record<string, string> = {
  Prensas: 'Crudo',
  Recubrimientos: 'Acabados'
};

/**
 * Devuelve la etiqueta visible para un nombre de área real.
 * Si el área no está mapeada, devuelve el mismo nombre sin cambios.
 */
export function displayArea(realName: string | null | undefined): string {
  if (!realName) return '';
  return AREA_DISPLAY_MAP[realName] ?? realName;
}
