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
// Lógica validada contra facturas reales de muestra (src/assets/images/
// FC_PTE2000400611SOAPRD.PDF y FC_pte2000399038SOAPRD.pdf — esta última una
// factura de EXPORTACIÓN sin código EAN, con encabezado multi-columna y
// formato dual-moneda COP/USD):
//
// - El layout de encabezado tiene dos columnas superpuestas (CLIENTE a la
//   izquierda / ENTREGADO A a la derecha) cuyas filas NO comparten la misma
//   coordenada Y entre columnas, por lo que agrupar todo el texto de la
//   página por línea visual (sin separar columnas) mezcla el orden de
//   aparición de "CIUDAD" y puede tomar la ciudad de facturación en vez de la
//   de entrega. Por eso el encabezado se extrae dividiendo los items de texto
//   en columna izquierda/derecha según su posición X (usando la etiqueta
//   "ENTREGADO A" como límite), y solo después se reconstruyen líneas dentro
//   de cada columna por separado.
// - El nombre del cliente puede partirse en varias líneas visuales (nombres
//   largos), por eso se captura hasta la siguiente etiqueta conocida
//   ("CÓDIGO") en vez de solo el resto de la línea actual.
// - La ciudad de entrega se captura como una sola palabra en mayúsculas: en
//   algunas facturas la etiqueta "CIUDAD" y su valor quedan como un único
//   item de pdfjs ("CIUDAD TEGUCIGALPA"), en otras como dos items separados
//   ("CIUDAD" + "MALAMBO"); además la columna derecha puede tener más
//   subcolumnas (RUTA/TERRITORIO/AREA VENTAS/No. INTERNO) cuyo contenido
//   puede terminar en la misma línea agrupada que una etiqueta "CIUDAD"
//   vacía — limitar la captura a una sola palabra evita arrastrar ese texto
//   vecino no relacionado.
// - No todas las facturas tienen código EAN (las de exportación solo traen
//   "código interno", ej. "AE 403-3 G"): las líneas de producto se detectan
//   por el patrón "cantidad + unidad de medida (C##) + valor unitario"
//   (siempre presente), no por la presencia de un EAN de 13 dígitos. Cuando
//   no hay EAN se usa el código interno como Producto.
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
  totalValue: number; // "TOTAL IMPORTE" del PDF: valor de los productos, sin IVA
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

  // Hasta la siguiente etiqueta conocida: el nombre puede partirse en varias
  // líneas visuales cuando es largo.
  const clientMatch = leftText.match(/CLIENTE\s+([\s\S]+?)\s*C[OÓ]DIGO\b/i);
  // La ciudad de entrega real está bajo "ENTREGADO A" (columna derecha), no la
  // ciudad de facturación del cliente (columna izquierda, bajo "CLIENTE").
  // Una sola palabra en mayúsculas (sin flag /i en la clase de caracteres,
  // para no matchear minúsculas por accidente) y se toma la PRIMERA
  // ocurrencia (orden de arriba hacia abajo) para no caer en una etiqueta
  // "CIUDAD" vacía que aparezca más abajo en la misma columna.
  const cityMatch = rightText.match(/CIUDAD\s*([A-ZÁÉÍÓÚÑ]+)/);
  const invoiceMatch = fullText.match(/\bP\d{6}\b/);

  return {
    client: clientMatch ? clientMatch[1].replace(/\s+/g, ' ').trim() : '',
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
 * Extrae las líneas de producto. El ancla es el patrón "cantidad + unidad de
 * medida (C##) + valor unitario", siempre presente en la línea reconstruida
 * de cada ítem (con o sin EAN, con o sin descripción multi-línea previa) —
 * no se ancla en el EAN porque las facturas de exportación no lo traen.
 * Si la línea trae un EAN de 13 dígitos antes de la cantidad, se usa ese
 * EAN; si no, se usa el "código interno" (ej. "AE 403-3 G") como Producto.
 */
function extractItemRows(fullText: string): Array<{ ean: string; internalCode: string; quantity: number; unitValue: number }> {
  const rows: Array<{ ean: string; internalCode: string; quantity: number; unitValue: number }> = [];

  for (const line of fullText.split('\n')) {
    if (/TOTAL\s+NRO\s+L[IÍ]NEAS/i.test(line)) break;
    if (!/IVA/i.test(line)) continue;

    const match = line.match(/^(.*?)(\d+(?:[.,]\d{1,2})?)\s+C\d{2}\s+([\d.,]+)/);
    if (!match) continue;

    const prefix = match[1].trim();
    const eanMatch = prefix.match(/\b(\d{13})\b/);
    const codeMatch = !eanMatch ? prefix.match(/^([A-Z]{1,3}\s?\d{2,4}[-\s][A-Z0-9]{1,3}(?:\s[A-Z]{1,3})?)/) : null;

    rows.push({
      ean: eanMatch ? eanMatch[1] : '',
      internalCode: eanMatch ? '' : (codeMatch ? codeMatch[1].trim() : ''),
      quantity: cleanNumber(match[2]),
      unitValue: cleanNumber(match[3]),
    });
  }

  return rows;
}

/**
 * Extrae el "TOTAL IMPORTE" (valor de los productos entregados, antes de
 * IVA) — importante para dimensionar la carga transportada (ej. reclamos de
 * siniestro), distinto del "TOTAL NETO A PAGAR" que incluye impuestos.
 */
function extractTotalValue(fullText: string): number {
  const match = fullText.match(/TOTAL\s+IMPORTE\s+([\d.,]+)/i);
  return match ? cleanNumber(match[1]) : 0;
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
  let totalValue = 0;

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

    if (!totalValue) {
      totalValue = extractTotalValue(fullText);
    }

    if (itemRows.length === 0) {
      warnings.push(`Página ${pageNumber}: no se encontraron líneas de producto.`);
      continue;
    }

    for (const item of itemRows) {
      if (!item.ean && !item.internalCode) {
        warnings.push(`Página ${pageNumber}: una línea no trajo EAN ni código interno identificable; verifique el Producto manualmente.`);
      }
      rows.push({
        client: header?.client || '',
        destinationCity: header?.destinationCity || '',
        ean: item.ean,
        product: item.ean ? item.ean.slice(-6) : item.internalCode,
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
  if (!totalValue) {
    warnings.push('No se pudo identificar el TOTAL IMPORTE de la factura.');
  }

  return { fileName: file.name, rows, totalValue, warnings };
}
