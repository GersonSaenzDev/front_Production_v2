// src/app/maintenance/maintenance-time.util.ts
//
// Conversión de fechas de las intervenciones de Mantenimiento. El backend guarda
// 'dd/MM/yyyy, HH:mm:ss' y los inputs datetime-local usan 'yyyy-MM-ddTHH:mm'.

/** Convierte un datetime-local (yyyy-MM-ddTHH:mm) a 'dd/MM/yyyy, HH:mm:ss'. */
export function toBackendDateTime(value: string): string {
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-');
  const time = timePart ? `${timePart}:00`.slice(0, 8) : '00:00:00';
  return `${day}/${month}/${year}, ${time}`;
}

/** Convierte 'dd/MM/yyyy, HH:mm:ss' (backend) a datetime-local 'yyyy-MM-ddTHH:mm'. */
export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const [datePart, timePart] = value.split(',').map((p) => p.trim());
  if (!datePart) return '';
  const [day, month, year] = datePart.split('/');
  if (!day || !month || !year) return '';
  const time = (timePart || '00:00:00').slice(0, 5);
  return `${year}-${month}-${day}T${time}`;
}

/** Minutos entre dos datetime-local (mismo cálculo que el backend); null si falta uno o fin < inicio. */
export function calculateMinutes(startLocal: string, endLocal: string): number | null {
  if (!startLocal || !endLocal) return null;
  const start = new Date(startLocal).getTime();
  const end = new Date(endLocal).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}

/** 90 → '1 h 30 min'; 30 → '30 min'. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
