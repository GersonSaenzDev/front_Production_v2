// app/warehouse/dash-inventories/dash-inventories.ts

import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';

import { Component, LOCALE_ID, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { throwError } from 'rxjs';
import { AuditNoteItem, AuditNoteRequest,AuditNoteResponseSimple, AuditNoteResponseWithItem, NotCompliantItem, } from 'src/app/interfaces/dashInventory.interface';
import { DashInventoryServices } from 'src/app/services/dashInventory-services';

import { SharedModule } from 'src/app/theme/shared/shared.module';

registerLocaleData(localeEs, 'es');

@Component({
  selector: 'app-dash-inventories',
  standalone: true,
  imports: [
    SharedModule,
    FormsModule,
  ],
  templateUrl: './dash-inventories.html',
  styleUrls: ['./dash-inventories.scss'],
  providers: [
    { provide: LOCALE_ID, useValue: 'es' },
  ]
})
export class DashInventories {

  private dashboardService = inject(DashInventoryServices);

  public selectedDate: string = this.formatDate(new Date());

  // Datos crudos / responses
  public storageGroupsData: any[] = [];
  public confirmedCountData: any[] = [];
  public duplicatesData: any[] = [];

  // Contadores que usa la plantilla
  public productosLeidosCount: number = 0;
  public equiposRegistradosCount: number = 0;
  public duplicadosCount: number = 0;
  public productosOkCount: number = 0;
  public noConformesCount: number = 0;
  public revisionesCount: number = 0;
  public configuracionesCount: number = 0;
  public bloqueosCount: number = 0;
  public globalCount: number = 0;
  public validatedTrueCount: number = 0;
  public validatedFalseCount: number = 0;
  public teamCount: number = 0;
  public areaCount: number = 0;

  // Propiedades del componente
  public notCompliantTotal: number = 0;
  public notCompliantTotalPages: number = 0;
  public notCompliantCurrentPage: number = 1;
  public notCompliantPageSize: number = 20;
  public notCompliantItems: NotCompliantItem[] = [];
  public notCompliantLoading: boolean = false;
  public notCompliantError: string = '';
  // Variables para el panel de no conformes
  public filteredNotCompliantItems: NotCompliantItem[] = [];
  public filterTextNotCompliant: string = '';
  public filterAreaNotCompliant: string = '';
  public filterTeamNotCompliant: string = '';

  // Estado del modal y dato seleccionado
  public showAnnotationModal: boolean = false;
  public annotationItem: any = null;
  public annotationText: string = '';

  // Panel y filtros
  public panel: 'global' | 'teams' | 'notCompliant' = 'global';
  public globalSearch = '';
  public filterText = '';
  public filterArea = '';
  public filterTeam = '';
  public areaOptions: string[] = [];
  public teamOptions: Array<{ key: string; label: string; area?: string }> = [];

  public loading: boolean = false;
  public errorMessage: string = '';

  // Inventario plano para tabla (uno por barcode)
  public inventoryList: Array<any> = [];
  public filteredInventory: Array<any> = [];

  // Paginación
  public p: number = 1;
  public itemsPerPage: number = 10;

  // Comparador por equipos
  public selectedTeamLeft: string = '';
  public selectedTeamRight: string = '';
  public teamLeft: { area?: string; total?: number; codes: string[] } | null = null;
  public teamRight: { area?: string; total?: number; codes: string[] } | null = null;

  public comparisonResult: { matchCount: number; diffCount: number } | null = null;

  constructor() {
    // Cargar datos iniciales (fecha por defecto)
    this.loadAllData(this.formatDateForBackend(this.selectedDate));
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
  }

  public formatDateForBackend(dateString: string | Date): string {
    const d = (typeof dateString === 'string') ? new Date(dateString.replace(/-/g, '/')) : dateString;
    let day = '' + d.getDate();
    let month = '' + (d.getMonth() + 1);
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [day, month, year].join('/');
  }

  public onDateChange(newDate: string): void {
    const dateForBackend = this.formatDateForBackend(newDate);
    this.loadAllData(dateForBackend);
  }

  // 1. Añade esta nueva propiedad para almacenar los resultados detallados
  public comparisonDetails: {
    leftMissing: any[],
    rightMissing: any[],
    matches: any[]
  } | null = null;

  public async loadAllData(dateForBackend: string): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    this.inventoryList = [];
    this.resetCounts(); // Limpiamos contadores antes de empezar

    try {
      const firstPage = await this.dashboardService.getViewInventories(dateForBackend, 100, 1).toPromise();

      if (firstPage?.ok && firstPage.msg) {
        let allItems = [...firstPage.msg.items];
        const totalPages = firstPage.msg.totalPages;

        if (totalPages > 1) {
          const remainingRequests = [];
          for (let i = 2; i <= totalPages; i++) {
            remainingRequests.push(this.dashboardService.getViewInventories(dateForBackend, 100, i).toPromise());
          }
          const responses = await Promise.all(remainingRequests);
          responses.forEach(res => {
            if (res?.ok && res.msg) {
              allItems = [...allItems, ...res.msg.items];
            }
          });
        }

        // --- PROCESAMIENTO DE DATOS Y CONTADORES ---
        const teamMap = new Map();
        const areaSet = new Set<string>();
        let compliant = 0;
        let nonCompliant = 0;
        let withNotes = 0;

        this.inventoryList = allItems.map((it: any) => {
          const persons = Array.isArray(it.persons) ? it.persons.filter(Boolean) : [];
          const teamKey = `${it.area || ''}||${persons.join('|')}`;
          const teamLabel = persons.length 
            ? `${it.area} — ${persons.join(', ')}` 
            : (it.area || 'Equipo sin nombre');

          // Lógica de contadores
          if (it.validate === true) compliant++;
          if (it.validate === false) nonCompliant++;
          if (it.area) areaSet.add(it.area);
          if (it.annotation || it.note) withNotes++;

          if (!teamMap.has(teamKey)) {
            teamMap.set(teamKey, { key: teamKey, label: teamLabel, area: it.area });
          }

          return { ...it, teamKey, teamLabel };
        });

        // Asignación de valores a las variables de la UI
        this.globalCount = this.inventoryList.length;
        this.validatedTrueCount = compliant;
        this.validatedFalseCount = nonCompliant;
        this.teamCount = teamMap.size;
        this.areaCount = areaSet.size;
        this.revisionesCount = nonCompliant; // Ejemplo: considerar revisiones a los no conformes
        this.configuracionesCount = withNotes; // Registros con novedades/notas

        this.teamOptions = Array.from(teamMap.values());
        this.areaOptions = Array.from(areaSet).sort(); // Poblamos el selector de áreas
        this.filteredInventory = [...this.inventoryList];
        
      }
    } catch (error) {
      this.errorMessage = "Error al obtener la lista completa de equipos.";
      console.error(error);
    } finally {
      this.loading = false;
    }
  }

  // Filtrado en la tabla global
  public applyGlobalFilters(): void {
    const q = (this.filterText || '').toLowerCase();
    this.filteredInventory = this.inventoryList.filter(it => {
      const matchesQ = q ? (
        String(it.code || '').toLowerCase().includes(q) ||
        String(it.referencia || '').toLowerCase().includes(q) ||
        String(it.producto || '').toLowerCase().includes(q) ||
        String(it.codRef || '').toLowerCase().includes(q)
      ) : true;
      const matchesArea = this.filterArea ? it.area === this.filterArea : true;
      const matchesTeam = this.filterTeam ? this.computeTeamKey(it) === this.filterTeam : true;
      return matchesQ && matchesArea && matchesTeam;
    });
  }

  public onGlobalFilterChange() {
    // simple alias
    this.applyGlobalFilters();
  }

  public resetGlobalFilters(): void {
    this.filterText = '';
    this.filterArea = '';
    this.filterTeam = '';
    this.filteredInventory = [...this.inventoryList];
  }

  // Helpers para teamKey
  public computeTeamKey(it: any): string {
    const persons = Array.isArray(it.persons) ? it.persons.filter(Boolean) : [];
    return `${it.area || ''}||${persons.join('|')}`;
  }

  // Selección equipo -> trae codes/area/total desde backend
  public onSelectTeam(side: 'left' | 'right'): void {
  const teamKey = side === 'left' ? this.selectedTeamLeft : this.selectedTeamRight;
  
  if (!teamKey) {
    if (side === 'left') this.teamLeft = null; else this.teamRight = null;
    this.comparisonDetails = null;
    return;
  }

  // Filtramos los items del inventario global que coinciden con la llave del equipo
  const teamItems = this.inventoryList.filter(it => this.computeTeamKey(it) === teamKey);

  const payload = {
    area: teamItems.length > 0 ? teamItems[0].area : '',
    total: teamItems.length,
    // Guardamos el objeto completo, no solo el código, para mostrar detalles en la comparación
    items: teamItems 
  };

  if (side === 'left') {
    this.teamLeft = { ...payload, codes: teamItems.map(i => i.code) };
  } else {
    this.teamRight = { ...payload, codes: teamItems.map(i => i.code) };
  }
  
  // Limpiar resultado previo al cambiar selección
  this.comparisonResult = null;
  this.comparisonDetails = null;
}

  public clearTeam(side: 'left' | 'right'): void {
    if (side === 'left') {
      this.selectedTeamLeft = '';
      this.teamLeft = null;
    } else {
      this.selectedTeamRight = '';
      this.teamRight = null;
    }
    this.comparisonResult = null;
  }

  public compareTeams(): void {
  if (!this.teamLeft || !this.teamRight) {
    this.comparisonResult = null;
    return;
  }

  const leftItems = (this.teamLeft as any).items;
  const rightItems = (this.teamRight as any).items;

  const leftCodes = new Set(this.teamLeft.codes);
  const rightCodes = new Set(this.teamRight.codes);

  // 1. ¿Qué tiene la Izquierda que NO tiene la Derecha?
  const leftMissingInRight = leftItems.filter((item: any) => !rightCodes.has(item.code));

  // 2. ¿Qué tiene la Derecha que NO tiene la Izquierda?
  const rightMissingInLeft = rightItems.filter((item: any) => !leftCodes.has(item.code));

  // 3. Coincidencias
  const matches = leftItems.filter((item: any) => rightCodes.has(item.code));

  this.comparisonDetails = {
    leftMissing: leftMissingInRight,
    rightMissing: rightMissingInLeft,
    matches: matches
  };

  this.comparisonResult = {
    matchCount: matches.length,
    diffCount: leftMissingInRight.length + rightMissingInLeft.length
  };
}

  public exportComparison(): void {
    if (!this.teamLeft || !this.teamRight) return;
    // Export simple CSV of code, leftCount(1), rightCount(1)
    const leftCounts = this.teamLeft.codes.reduce((acc: any, c) => (acc[c] = (acc[c] || 0) + 1, acc), {});
    const rightCounts = this.teamRight.codes.reduce((acc: any, c) => (acc[c] = (acc[c] || 0) + 1, acc), {});
    const union = Array.from(new Set([...Object.keys(leftCounts), ...Object.keys(rightCounts)]));
    const rows = union.map(code => `${code},${leftCounts[code]||0},${rightCounts[code]||0}`);
    const csv = ['code,leftCount,rightCount', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private resetCounts(): void {
    this.productosLeidosCount = 0;
    this.equiposRegistradosCount = 0;
    this.duplicadosCount = 0;
    this.productosOkCount = 0;
    this.noConformesCount = 0;
    this.revisionesCount = 0;
    this.validatedTrueCount = 0;
    this.validatedFalseCount = 0;
    this.globalCount = 0;
    this.teamCount = 0;
    this.areaCount = 0;
  }

  /* --- Abrir modal y precargar anotación existente --- */
  public openAnnotationModal(item: AuditNoteItem): void {
    this.annotationItem = item;
    this.annotationText = item?.annotation ?? item?.note ?? '';
    this.showAnnotationModal = true;
  }

  /* --- Cerrar modal (sin guardar) --- */
  public closeAnnotationModal(): void {
    this.showAnnotationModal = false;
    this.annotationItem = null;
    this.annotationText = '';
  }

  /* --- Guardar: llama a sendAuditNoteForItem para persistir en backend --- */
  public saveAnnotation(): void {
    if (!this.annotationItem) return;

    const note = (this.annotationText || '').trim();

    // Evitar llamada si no hay cambios (opcional)
    if (note === (this.annotationItem.annotation ?? this.annotationItem.note ?? '')) {
      this.closeAnnotationModal();
      return;
    }

    // Llamada para persistir la anotación (se encarga de actualizar arrays locales)
    this.sendAuditNoteForItem({
      code: this.annotationItem.code,
      referencia: this.annotationItem.referencia,
      area: this.annotationItem.area
    }, note);
  }

  // Type-guards (colócalos en la clase DashInventories)
  private isSimpleResponse(res: any): res is AuditNoteResponseSimple {
    return !!res && typeof res.msg === 'string';
  }
  private isWithItemResponse(res: any): res is AuditNoteResponseWithItem {
    return !!res && res.msg && typeof res.msg === 'object' && ('code' in res.msg || '_id' in res.msg);
  }

  /* --- Enviar nota al backend y actualizar estado local --- */
  public sendAuditNoteForItem(item: { code: string; referencia?: string; area?: string }, noteText: string) {
    const dateForBackend = this.formatDateForBackend(this.selectedDate); // 'DD/MM/YYYY'
    const payload: AuditNoteRequest = {
      barcode: item.code,
      reference: item.referencia,
      area: item.area,
      note: noteText,
      date: dateForBackend
    };

    // Mostrar spinner/estado local de guardado
    this.notCompliantLoading = true;

    this.dashboardService.getAuditNote(payload).subscribe({
      next: (res) => {
        // Validación básica del body de respuesta
        if (!res || !res.ok) {
          console.warn('Respuesta no OK del backend:', res);
          this.notCompliantLoading = false;
          return;
        }

        // Buscar item localmente (por código) en la lista original
        const found = this.notCompliantItems.find(i => String(i.code) === String(payload.barcode));

        if (this.isSimpleResponse(res)) {
          // Backend devolvió solo mensaje -> actualizamos la anotación con lo enviado
          if (found) {
            found.annotation = payload.note ?? found.annotation;
          } else {
            // opcional: insertar registro mínimo si necesitas reflejarlo en UI
          }
          console.log(res.msg);
        } else if (this.isWithItemResponse(res)) {
          const updated = (res as AuditNoteResponseWithItem).msg;
          console.log('Respuesta con item actualizado:', updated);
          if (found) {
            // Actualizar solo campos relevantes
            found.annotation = updated.annotation ?? updated.note ?? payload.note ?? found.annotation;
            found.area = updated.area ?? found.area;
            found.referencia = updated.referencia ?? found.referencia;
            found.producto = updated.producto ?? found.producto;
            found.validate = typeof updated.validate === 'boolean' ? updated.validate : found.validate;
            found.codRef = typeof updated.codRef === 'number' ? updated.codRef : found.codRef;
            found.persons = Array.isArray(updated.persons) ? updated.persons : found.persons;
            found.team = updated.team ?? found.team;
          } else {
            // Insertar el item si no existía antes (opcional)
            this.notCompliantItems.push({
              _id: updated._id,
              area: updated.area,
              persons: updated.persons || [],
              team: updated.team || '',
              code: updated.code,
              codRef: updated.codRef,
              referencia: updated.referencia,
              producto: updated.producto,
              validate: updated.validate,
              annotation: updated.annotation ?? updated.note
            } as NotCompliantItem);
          }
          console.log('Item actualizado:', updated);
        } else {
          // En caso de estructura inesperada, aplicar la nota enviada
          if (found) found.annotation = payload.note ?? found.annotation;
          console.warn('Respuesta con formato inesperado:', res);
        }

        // Reaplicar filtros para actualizar la tabla mostrada
        this.applyNotCompliantFilters();

        // Cerrar modal y limpiar estado
        this.closeAnnotationModal();
        this.notCompliantLoading = false;
      },
      error: (err) => {
        console.error('Error al guardar anotación:', err);
        this.notCompliantLoading = false;
        // Aquí puedes mostrar una notificación al usuario con el error
      }
    });
  }

  // --- Cargar datos no conformes (fecha en formato backend) ---
  loadNotCompliantData(date: string, page: number = 1, limit: number = 20) {
    // payload puede incluir page y limit: dependiendo de la definición del servicio,
    // si getNotCompliant tiene una firma estricta ajusta el servicio o castea el payload.
    const payload: any = { teamKey: 'all', page, limit };

    this.dashboardService.getNotCompliant(date, payload).subscribe({
      next: (res) => {
        if (res && res.ok && res.msg) {
          this.notCompliantTotal = res.msg.total ?? 0;
          this.notCompliantTotalPages = res.msg.totalPages ?? 0;
          this.notCompliantCurrentPage = res.msg.currentPage ?? page;
          this.notCompliantItems = res.msg.items ?? [];
          this.applyNotCompliantFilters();
        } else {
          this.resetNotCompliantData();
        }
      },
      error: (err) => {
        console.error('Error getNotCompliant:', err);
        this.errorMessage = err?.message || 'Error cargando items no conformes';
        this.resetNotCompliantData();
      }
    });
  }

  private resetNotCompliantData() {
    this.notCompliantTotal = 0;
    this.notCompliantTotalPages = 0;
    this.notCompliantCurrentPage = 1;
    this.notCompliantItems = [];
    this.filteredNotCompliantItems = [];
  }

  // --- Filtros localmente aplicados ---
  applyNotCompliantFilters() {
    const text = (this.filterTextNotCompliant || '').trim().toLowerCase();

    this.filteredNotCompliantItems = this.notCompliantItems.filter(item => {
      const matchesText = !text ||
        (item.code || '').toLowerCase().includes(text) ||
        (item.referencia || '').toLowerCase().includes(text) ||
        (item.producto || '').toLowerCase().includes(text);

      const matchesArea = !this.filterAreaNotCompliant || item.area === this.filterAreaNotCompliant;
      const matchesTeam = !this.filterTeamNotCompliant || item.team === this.filterTeamNotCompliant;

      return matchesText && matchesArea && matchesTeam;
    });
  }

  resetNotCompliantFilters() {
    this.filterTextNotCompliant = '';
    this.filterAreaNotCompliant = '';
    this.filterTeamNotCompliant = '';
    this.applyNotCompliantFilters();
  }

  // --- Paginación: método requerido por la plantilla ---
  changeNotCompliantPage(page: number) {
    if (!page || page < 1) return;
    if (this.notCompliantTotalPages && page > this.notCompliantTotalPages) return;

    const dateForBackend = this.formatDateForBackend(this.selectedDate); // usa tu función existente
    this.loadNotCompliantData(dateForBackend, page, this.notCompliantPageSize);
  }

  private handleError(error: any) {
    console.error('DashInventoryServices: Error en la petición:', error);
    let errorMessage = 'Ocurrió un error inesperado.';

    // Si el backend envió un body de error (ej: 400 Bad Request)
    if (error.error) {
      // Capturamos el campo "msg" exacto que enviaste: "Error de validación: Se enviaron 4 códigos..."
      errorMessage = error.error.msg || error.error.message || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return throwError(() => new Error(errorMessage));
  }

  public clearErrorMessage() {
    this.errorMessage = '';
  }

}