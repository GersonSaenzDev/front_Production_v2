// src/app/machining/mechanics-time.util.ts
//
// Fechas de Mecánica: reutiliza la conversión de Mantenimiento (mismo formato de backend
// 'dd/MM/yyyy, HH:mm:ss') y agrega las de fecha sola ('dd/MM/yyyy' <-> 'yyyy-MM-dd').
export { calculateMinutes, formatMinutes, toBackendDateTime, toDatetimeLocal } from '../maintenance/maintenance-time.util';

/** Convierte un date (yyyy-MM-dd) a 'dd/MM/yyyy'. Si ya viene en formato backend, lo deja igual. */
export function toBackendDate(value: string): string {
  if (!value) return '';
  if (value.includes('/')) return value;
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/** Convierte 'dd/MM/yyyy' (o 'dd/MM/yyyy, HH:mm:ss') a un date input (yyyy-MM-dd). */
export function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const datePart = value.split(',')[0].trim();
  const [day, month, year] = datePart.split('/');
  if (!day || !month || !year) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
