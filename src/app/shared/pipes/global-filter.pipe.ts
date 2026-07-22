// app/shared/pipes/global-filter.pipe.ts
import { Pipe, PipeTransform } from '@angular/core';

/**
 * Filtra un arreglo de objetos buscando el término en cualquier valor primitivo del objeto
 * (incluyendo arreglos y objetos anidados), sin importar qué campos tenga la respuesta del backend.
 */
@Pipe({
  name: 'globalFilter',
  standalone: true
})
export class GlobalFilterPipe implements PipeTransform {
  transform<T>(items: T[] | null | undefined, term: string | null | undefined): T[] {
    if (!items || items.length === 0) return [];
    const normalizedTerm = (term || '').trim().toLowerCase();
    if (!normalizedTerm) return items;
    return items.filter((item) => this.matches(item, normalizedTerm));
  }

  private matches(value: unknown, term: string): boolean {
    if (value === null || value === undefined) return false;

    if (typeof value === 'string') return value.toLowerCase().includes(term);

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).toLowerCase().includes(term);
    }

    if (Array.isArray(value)) return value.some((entry) => this.matches(entry, term));

    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((entry) => this.matches(entry, term));
    }

    return false;
  }
}
