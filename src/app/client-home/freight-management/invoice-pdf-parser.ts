// src/app/client-home/freight-management/invoice-pdf-parser.ts
//
// Extrae de la factura electrónica de venta (formato DIAN, CEN-Financiero /
// Carvajal, generada con JasperReports) los datos necesarios para precargar
// las líneas del despacho de flete: Cliente, Ciudad de entrega, EAN, Producto
// (últimos 6 dígitos del EAN), Cantidad y Valor Unitario. El Flete queda
// pendiente de diligenciar manualmente por el usuario. Soporta facturas de
// varias páginas (el encabezado normalmente solo está en la primera página;
// se reutiliza para todas las líneas encontradas en el resto de páginas).
//
// Lógica validada contra una factura real de muestra (src/assets/images/
// FC_PTE2000400611SOAPRD.PDF): el layout de encabezado tiene dos columnas
// superpuestas (CLIENTE a la izquierda / ENTREGADO A a la derecha) cuyas filas
// NO comparten la misma coordenada Y entre columnas, por lo que agrupar todo
// el texto de la página por línea visual (sin separar columnas) mezcla el
// orden de aparición de "CIUDAD" y puede tomar la ciudad de facturación en vez
// de la de entrega. Por eso el encabezado se extrae dividiendo los items de
// texto en columna izquierda/derecha según su posición X (usando la etiqueta
// "ENTREGADO A" como límite), y solo después se reconstruyen líneas dentro de
// cada columna por separado.
import * as pdfjsLib from 'pdfjs-dist';

// Se sirve como asset estático (copiado por angular.json desde
// node_modules/pdfjs-dist/build/) en vez de resolverse vía `new URL(...,
// import.meta.url)`: este proyecto usa el builder clásico de Angular basado
// en webpack (@angular-devkit/build-angular:browser), que no reescribe esa
// expresión a una URL de asset en build time como sí lo hacen los bundlers
// basados en esbuild/Vite.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.mjs';

export interface ParsedInvoiceRow {
  client: string;
  destinationCity: string;
  ean: string;
  product: string;
  quantity: number;
  unitValue: number;
  invoiceNumber: string;
}

export interface ParsedInvoiceResult {
  fileName: string;
  rows: ParsedInvoiceRow[];
  warnings: string[];
}

interface TextItem {
  str: string;
  x: number;
  y: number;
}

interface InvoiceHeader {
  client: string;
  destinationCity: string;
  invoiceNumber: string;
}

/** Agrupa items de texto por posición Y (línea visual) y los une ordenados por X. */
function joinLines(items: TextItem[]): string[] {
  const buckets = new Map<number, TextItem[]>();
  for (const item of items) {
    const key = Math.round(item.y / 3) * 3; // tolerancia de agrupacion (~3pt)
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }

  const lines = Array.from(buckets.entries()).map(([y, its]) => ({
    y,
    text: its.sort((a, b) => a.x - b.x).map((i) => i.str).join(' '),
  }));

  lines.sort((a, b) => b.y - a.y); // de arriba hacia abajo (Y del PDF crece hacia arriba)
  return lines.map((l) => l.text);
}

/**
 * Extrae Cliente, Ciudad de entrega y N° de factura del encabezado, separando
 * primero los items en columna izquierda (CLIENTE) / derecha (ENTREGADO A)
 * según su posición X, para no mezclar el orden de las dos columnas.
 */
function extractHeader(items: TextItem[], pageWidth: number): InvoiceHeader {
  const entregado = items.find((it) => /ENTREGADO\s*A/i.test(it.str));
  const splitX = entregado ? entregado.x : pageWidth / 2;

  const leftText = joinLines(items.filter((it) => it.x < splitX)).join('\n');
  const rightText = joinLines(items.filter((it) => it.x >= splitX)).join('\n');
  const fullText = items.map((i) => i.str).join(' ');

  const clientMatch = leftText.match(/CLIENTE\s+(.+)/i);
  // La ciudad de entrega real está bajo "ENTREGADO A" (columna derecha), no la
  // ciudad de facturación del cliente (columna izquierda, bajo "CLIENTE").
  const cityMatch = rightText.match(/CIUDAD\s+(.+)/i);
  const invoiceMatch = fullText.match(/\bP\d{6}\b/);

  return {
    client: clientMatch ? clientMatch[1].trim() : '',
    destinationCity: cityMatch ? cityMatch[1].trim() : '',
    invoiceNumber: invoiceMatch ? invoiceMatch[0] : '',
  };
}

/** El PDF usa coma como separador de miles y punto como decimal (ej. "399,000.00"). */
function cleanNumber(raw: string): number {
  const normalized = raw.replace(/,/g, '');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Extrae las líneas de producto: bloques de texto que empiezan con un código
 * EAN de 13 dígitos, hasta el siguiente EAN (la descripción puede partirse en
 * varias líneas visuales, por eso se busca por bloque y no por línea única).
 * Dentro de cada bloque se busca cantidad + unidad de medida (C##) + valor
 * unitario, justo antes del marcador "IVA" de esa línea.
 */
function extractItemRows(fullText: string): Array<{ ean: string; quantity: number; unitValue: number }> {
  const rows: Array<{ ean: string; quantity: number; unitValue: number }> = [];
  const eanPositions = [...fullText.matchAll(/\b(\d{13})\b/g)];

  for (let i = 0; i < eanPositions.length; i++) {
    const start = eanPositions[i].index ?? 0;
    const end = i + 1 < eanPositions.length ? (eanPositions[i + 1].index ?? fullText.length) : fullText.length;
    const block = fullText.slice(start, Math.min(end, start + 400));

    const match = block.match(/(\d+(?:[.,]\d{1,2})?)\s+C\d{2}\s+([\d.,]+)\s+[\d.,]+\s+IVA/i);
    if (!match) continue;

    rows.push({
      ean: eanPositions[i][1],
      quantity: cleanNumber(match[1]),
      unitValue: cleanNumber(match[2]),
    });

    if (/TOTAL\s+NRO\s+L[IÍ]NEAS/i.test(block)) break;
  }

  return rows;
}

/**
 * Parsea un PDF de factura (puede tener varias páginas) y devuelve las filas
 * a precargar en la grilla de ítems del despacho. El encabezado (cliente,
 * ciudad, N° factura) se toma de la primera página donde se identifique y se
 * aplica a todas las líneas de producto encontradas en el documento completo.
 */
export async function parseInvoicePdf(file: File): Promise<ParsedInvoiceResult> {
  const warnings: string[] = [];
  const rows: ParsedInvoiceRow[] = [];

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let header: InvoiceHeader | null = null;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: TextItem[] = (content.items as Array<{ str?: string; transform: number[] }>)
      .map((it) => ({ str: (it.str || '').trim(), x: it.transform[4], y: it.transform[5] }))
      .filter((it) => it.str);

    if (!header || !header.client) {
      const candidate = extractHeader(items, viewport.width);
      if (candidate.client) header = candidate;
    }

    const fullText = joinLines(items).join('\n');
    const itemRows = extractItemRows(fullText);

    if (itemRows.length === 0) {
      warnings.push(`Página ${pageNumber}: no se encontraron líneas de producto.`);
      continue;
    }

    for (const item of itemRows) {
      rows.push({
        client: header?.client || '',
        destinationCity: header?.destinationCity || '',
        ean: item.ean,
        product: item.ean.slice(-6),
        quantity: item.quantity,
        unitValue: item.unitValue,
        invoiceNumber: header?.invoiceNumber || '',
      });
    }
  }

  if (!header || !header.client) {
    warnings.push('No se pudo identificar el cliente en la factura. Verifique/complete los datos manualmente.');
  }
  if (rows.length === 0) {
    warnings.push('No se encontraron líneas de producto en el archivo.');
  }

  return { fileName: file.name, rows, warnings };
}
