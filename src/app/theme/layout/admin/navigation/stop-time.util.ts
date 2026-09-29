// src/app/theme/layout/admin/navigation/stop-time.util.ts
// Utilidades de tiempo para paradas de proceso (compartidas por registro, consulta y panel
// de paradas en curso). El inicio de una parada es newsDate (DD/MM/YYYY) + stop.startTime.

import { NewsStop } from '../../../../interfaces/assembly.interface';

/** Categorías que representan una parada (valor actual + legacy). */
export const STOP_CATEGORIES = ['Parada de Proceso', 'Parada de Línea', 'Parada de Linea'];

interface StopLike {
  category?: string;
  newsDate?: string;
  stop?: NewsStop;
}

export function isStopCategory(category: string | null | undefined): boolean {
  return STOP_CATEGORIES.includes(category || '');
}

/** La parada fue reportada sin fin y aún no se ha finalizado. */
export function isStopOngoing(item: StopLike | null | undefined): boolean {
  return !!item?.stop?.isOngoing;
}

/** 'DD/MM/YYYY' + 'HH:mm' -> Date local. Acepta día/mes/hora de un dígito (datos antiguos). */
export function parseStopMoment(date: string | null | undefined, time: string | null | undefined): Date | null {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((date || '').trim());
  const t = /^(\d{1,2}):(\d{2})/.exec((time || '').trim());
  if (!d || !t || +t[1] > 23 || +t[2] > 59) return null;
  const moment = new Date(+d[3], +d[2] - 1, +d[1], +t[1], +t[2], 0, 0);
  return isNaN(moment.getTime()) ? null : moment;
}

/** Inicio real de la parada. */
export function stopStartMoment(item: StopLike): Date | null {
  return parseStopMoment(item.newsDate, item.stop?.startTime);
}

/** 'yyyy-MM-dd' (input date) -> 'DD/MM/YYYY'. */
export function isoToDdMmYyyy(iso: string): string {
  const [year, month, day] = (iso || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}

/** Date -> 'yyyy-MM-dd' (valor de input date). */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Date -> 'HH:mm' (valor de input time). */
export function toHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Minutos enteros entre dos fechas (redondeo al minuto). */
export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

/** Minutos -> 'HH:mm' (formato guardado en stop.totalTime; horas pueden superar 24). */
export function formatStopTotal(totalMinutes: number): string {
  const safe = Math.max(0, totalMinutes);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** Minutos -> texto legible: '2d 3h 05m', '3h 05m', '12m'. */
export function formatDurationLabel(totalMinutes: number): string {
  const safe = Math.max(0, totalMinutes);
  const days = Math.floor(safe / 1440);
  const hours = Math.floor((safe % 1440) / 60);
  const minutes = String(safe % 60).padStart(2, '0');
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${safe % 60}m`;
}

/**
 * Horario legible de la parada:
 *  - En curso:               '14:30 - En curso'
 *  - Termina el mismo día:   '14:30 - 15:10'
 *  - Termina otro día:       '14:30 - 29/09 07:05'
 */
export function formatStopSchedule(item: StopLike & { startTime?: string; endTime?: string }): string {
  const start = item.stop?.startTime || item.startTime;
  if (isStopOngoing(item)) return `${start || '—'} - En curso`;

  const end = item.stop?.endTime || item.endTime;
  if (!start && !end) return '—';

  const endDate = item.stop?.endDate;
  const endLabel = end && endDate && endDate !== item.newsDate ? `${endDate.slice(0, 5)} ${end}` : end;
  return `${start || '—'} - ${endLabel || '—'}`;
}
