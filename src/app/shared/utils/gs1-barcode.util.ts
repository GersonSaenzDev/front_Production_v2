// src/app/shared/utils/gs1-barcode.util.ts
//
// Lectura de códigos GS1-128 (EAN128): (01) GTIN + (21) Serial con largo VARIABLE según el
// proveedor/cliente. Espejo de api_produccion/src/production/storage/helpers/gs1Barcode.js:
// el backend es la fuente de verdad; aquí solo se usa para feedback inmediato y para
// normalizar antes de encolar (26 dígitos con GTIN-13 -> forma canónica de 27).
//
//   (01)07706060029212(21)220405544 -> GTIN-14 + serial = 27 dígitos
//   (01)7706060000495(21)610850001  -> GTIN-13 + serial = 26 -> 010770606000049521610850001

const GS = '\x1d';
const SERIAL_PATTERN = /^[0-9A-Za-z]{1,20}$/;
export const DISPATCH_BARCODE_LENGTH = 27;

export type Gs1ParseErrorCode = 'EMPTY' | 'NO_SERIAL' | 'NOT_GS1';

export interface Gs1Barcode {
  gtin14: string;
  serial: string;
  /** Forma canónica '01' + GTIN-14 + '21' + serial. */
  barcode: string;
  gtinLength: number;
  normalized: boolean;
  checkDigitValid: boolean;
  /** Producto Summum (5 dígitos) cuando el GTIN es de la compañía. */
  product: string;
  dispatchable: boolean;
}

/** ok=true trae `data`; ok=false trae `code` y `msg` (sin strictNullChecks la unión discriminada no se estrecha). */
export interface Gs1ParseResult {
  ok: boolean;
  data?: Gs1Barcode;
  code?: Gs1ParseErrorCode;
  msg?: string;
}

export function gs1CheckDigit(digitsWithoutCheck: string): string {
  let sum = 0;
  digitsWithoutCheck
    .split('')
    .reverse()
    .forEach((d, i) => (sum += Number(d) * (i % 2 === 0 ? 3 : 1)));
  return String((10 - (sum % 10)) % 10);
}

export function isValidGtin(gtin: string): boolean {
  return /^\d{13,14}$/.test(gtin) && gs1CheckDigit(gtin.slice(0, -1)) === gtin.slice(-1);
}

/** Quita identificador de simbología (]C1), paréntesis y espacios; conserva el separador GS. */
function cleanRaw(raw: string): string {
  return String(raw || '')
    .replace(/^\](C1|e0|d2)/i, '')
    .replace(/[()\s]/g, '')
    .split('')
    .filter((ch) => ch === GS || /[0-9A-Za-z]/.test(ch))
    .join('');
}

export function parseGs1Barcode(raw: string): Gs1ParseResult {
  const clean = cleanRaw(raw);
  if (!clean) return { ok: false, code: 'EMPTY', msg: 'Lectura vacía.' };

  if (/^\d{13,14}$/.test(clean)) {
    return { ok: false, code: 'NO_SERIAL', msg: 'Ese es el código EAN de la caja (sin serial). Lea el código largo GS1-128: (01)…(21)…' };
  }
  if (!clean.startsWith('01')) {
    return { ok: false, code: 'NOT_GS1', msg: 'El código no es GS1-128: debe iniciar con (01) GTIN y traer (21) Serial.' };
  }

  const candidates = [14, 13]
    .map((len) => {
      const gtin = clean.substring(2, 2 + len);
      const aiPos = 2 + len;
      if (!/^\d+$/.test(gtin) || gtin.length !== len) return null;
      if (clean.substring(aiPos, aiPos + 2) !== '21') return null;
      const serial = clean.substring(aiPos + 2).split(GS)[0];
      if (!SERIAL_PATTERN.test(serial)) return null;
      return { len, gtin, serial, checkDigitValid: isValidGtin(gtin) };
    })
    .filter((c): c is { len: number; gtin: string; serial: string; checkDigitValid: boolean } => !!c);

  if (!candidates.length) {
    return /^01\d{13,14}$/.test(clean.split(GS).join(''))
      ? { ok: false, code: 'NO_SERIAL', msg: 'El código trae el producto (01) pero no el serial (21). Lea la etiqueta con serial.' }
      : { ok: false, code: 'NOT_GS1', msg: 'No se encontró la estructura (01) GTIN + (21) Serial en el código leído.' };
  }

  const chosen = candidates.find((c) => c.checkDigitValid) || candidates[0];
  const gtin14 = chosen.gtin.padStart(14, '0');
  const barcode = `01${gtin14}21${chosen.serial}`;
  return {
    ok: true,
    data: {
      gtin14,
      serial: chosen.serial,
      barcode,
      gtinLength: chosen.len,
      normalized: barcode !== clean,
      checkDigitValid: chosen.checkDigitValid,
      product: barcode.substring(10, 15),
      dispatchable: /^\d+$/.test(barcode) && barcode.length === DISPATCH_BARCODE_LENGTH
    }
  };
}

/**
 * Serial para los flujos de 27 dígitos (prealistamiento / muelle): si viene con GTIN-13
 * (26 dígitos) se lleva a la forma canónica de 27; si no aplica, devuelve los dígitos leídos.
 */
export function normalizeDispatchSerial(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === DISPATCH_BARCODE_LENGTH) return digits;
  const parsed = parseGs1Barcode(raw);
  return parsed.ok ? parsed.data.barcode : digits;
}
