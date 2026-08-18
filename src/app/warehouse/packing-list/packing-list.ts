// src/app/warehouse/packing-list/packing-list.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

import { DashboardServices } from '../../services/dashboard-services';
import { AuthService } from '../../services/auth-services';
import { PackingListActorRef, PackingListRecord } from '../../interfaces/assembly.interface';

interface PackingHourGroup {
  hour: string;
  items: PackingListRecord[];
  total: number;
  checked: number;
  pending: number;
}

@Component({
  selector: 'app-packing-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './packing-list.html',
  styleUrl: './packing-list.scss'
})
export class PackingList implements OnInit {
  private readonly dashboardService = inject(DashboardServices);
  private readonly authService = inject(AuthService);
  private readonly toastr = inject(ToastrService);

  // ============================================================
  //  FILTRO POR RANGO DE FECHAS (por defecto: hoy)
  // ============================================================

  public dateIni: string = this.formatDate(new Date());
  public dateEnd: string = this.formatDate(new Date());
  public isLoading = false;

  private allRecords: PackingListRecord[] = [];
  public hourGroups: PackingHourGroup[] = [];

  // ============================================================
  //  GRUPO DE HORAS SELECCIONADO Y SU DETALLE
  // ============================================================

  public selectedGroup: PackingHourGroup | null = null;
  public searchTerm = '';
  public filteredItems: PackingListRecord[] = [];

  /** ids en proceso de guardado, para bloquear su checkbox mientras responde el backend */
  public savingIds = new Set<string>();

  get totalRecords(): number {
    return this.allRecords.length;
  }

  get totalChecked(): number {
    return this.allRecords.filter((record) => record.packingList?.checked).length;
  }

  get totalPending(): number {
    return this.totalRecords - this.totalChecked;
  }

  ngOnInit(): void {
    this.loadPackingList();
  }

  public onDateRangeChange(): void {
    this.loadPackingList();
  }

  public loadPackingList(): void {
    if (!this.dateIni || !this.dateEnd) return;

    this.isLoading = true;
    this.dashboardService.getPackingList(this.dateIni, this.dateEnd).subscribe({
      next: (response) => {
        this.allRecords = response.ok ? response.msg : [];
        this.hourGroups = this.buildHourGroups(this.allRecords);

        // Si el grupo seleccionado sigue existiendo tras recargar, refrescamos su detalle;
        // si desapareció (cambio de rango de fechas), volvemos al listado de grupos.
        if (this.selectedGroup) {
          const stillExists = this.hourGroups.find((group) => group.hour === this.selectedGroup!.hour);
          this.selectGroup(stillExists || null);
        }
      },
      error: (err) => {
        this.allRecords = [];
        this.hourGroups = [];
        this.selectedGroup = null;
        this.toastr.error(err.message || 'No se pudo consultar el packing list.');
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  private buildHourGroups(records: PackingListRecord[]): PackingHourGroup[] {
    const groupsByHour = new Map<string, PackingListRecord[]>();

    for (const record of records) {
      const hour = record.hour || 'Sin hora';
      const items = groupsByHour.get(hour) || [];
      items.push(record);
      groupsByHour.set(hour, items);
    }

    return Array.from(groupsByHour.entries())
      .map(([hour, items]) => ({
        hour,
        items,
        total: items.length,
        checked: items.filter((item) => item.packingList?.checked).length,
        pending: items.filter((item) => !item.packingList?.checked).length
      }))
      .sort((a, b) => this.compareHours(a.hour, b.hour));
  }

  /** Ordena por el primer número que aparezca en la hora (ej. "07:00" antes de "14:00"); si no hay número, cae a orden alfabético. */
  private compareHours(a: string, b: string): number {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  }

  // ============================================================
  //  SELECCIÓN DE GRUPO Y BÚSQUEDA DENTRO DEL DETALLE
  // ============================================================

  public selectGroup(group: PackingHourGroup | null): void {
    this.selectedGroup = group;
    this.searchTerm = '';
    this.applyFilter();
  }

  public backToGroups(): void {
    this.selectGroup(null);
  }

  private normalizeSearchText(value: string): string {
    return value.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase().trim();
  }

  public applyFilter(): void {
    if (!this.selectedGroup) {
      this.filteredItems = [];
      return;
    }

    const tokens = this.normalizeSearchText(this.searchTerm).split(/\s+/).filter(Boolean);

    this.filteredItems =
      tokens.length === 0
        ? [...this.selectedGroup.items]
        : this.selectedGroup.items.filter((item) => {
            const haystack = this.normalizeSearchText(
              [item.barcode, item.productCode, item.productName, item.consecutiveProduct].filter(Boolean).join(' ')
            );
            return tokens.every((token) => haystack.includes(token));
          });
  }

  // ============================================================
  //  VALIDACIÓN CRUZADA (check/uncheck por item)
  // ============================================================

  private buildCheckedBy(): PackingListActorRef {
    const user = this.authService.userData();
    return {
      uid: user?.uid || '',
      userApp: user?.userApp || '',
      name: user?.full_name || ''
    };
  }

  public isSaving(item: PackingListRecord): boolean {
    return this.savingIds.has(item._id);
  }

  public toggleCheck(item: PackingListRecord): void {
    if (this.isSaving(item)) return;

    const nextChecked = !item.packingList?.checked;
    this.savingIds.add(item._id);

    this.dashboardService.checkPackingListItem({ id: item._id, checked: nextChecked, checkedBy: this.buildCheckedBy() }).subscribe({
      next: (response) => {
        if (response.ok && response.data) {
          item.packingList = response.data.packingList;
        } else {
          this.toastr.error(response.msg || 'No se pudo actualizar la verificación del item.');
        }
      },
      error: (err) => {
        this.toastr.error(err.message || 'Error al actualizar la verificación del item.');
      },
      complete: () => {
        this.savingIds.delete(item._id);
        if (this.selectedGroup) {
          const groupItems = this.selectedGroup.items;
          this.selectedGroup.checked = groupItems.filter((groupItem) => groupItem.packingList?.checked).length;
          this.selectedGroup.pending = this.selectedGroup.total - this.selectedGroup.checked;
        }
      }
    });
  }

  // ============================================================
  //  UTILIDADES DE FECHA
  // ============================================================

  private formatDate(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
