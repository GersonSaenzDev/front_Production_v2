// src/app/services/menu-access.service.ts
import { Injectable, inject } from '@angular/core';
import { UserDataMenu } from '../interfaces/auth.interface';
import { AuthService } from './auth-services';

export type AppModule = 'production' | 'inventories' | 'printing' | 'clientHome' | 'quality' | 'engineering' | 'health-safety' | 'human-resources' | 'maintenance' | 'machining' | 'logistics' | 'all';

@Injectable({
  providedIn: 'root'
})
export class MenuAccessService {
  private authService = inject(AuthService);

  constructor() {}

  hasAccessTo(module: AppModule): boolean {
    const userData = this.authService.userData();
    
    if (!userData) {
      return false;
    }

    return this.checkAccess(userData, module);
  }

  getAllowedRoutes(): string[] {
    const allowed: string[] = [];
    const modules: AppModule[] = ['production', 'inventories', 'printing', 'clientHome', 'quality', 'engineering', 'health-safety', 'human-resources', 'maintenance', 'machining', 'logistics'];
    
    modules.forEach(m => {
      if (this.hasAccessTo(m)) {
        allowed.push(`/${m}`);
      }
    });
    
    return allowed;
  }

  // Mapeo: grupo top-level → áreas autorizadas (en MAYÚSCULAS)
  // Los grupos no listados aquí son visibles para todos (ej. "Panel de Control")
  private readonly GROUP_AREA_MAP: Record<string, string[]> = {
    'PLANEACIÓN': ['PRODUCCION'],
    'PRODUCCIÓN': ['PRODUCCION'],
    'LOGÍSTICA': ['LOGISTICA'],
    'ALMACÉN': ['ALMACEN', 'LOGISTICA'],
    'MANTENIMIENTO': ['MANTENIMIENTO'],
    'MECANIZADO': ['MECANIZADO', 'MECANICA'],
    'INGENIERÍA': ['INGENIERIA INDUSTRIAL','INGENIERIA PRODUCTO'],
    'RECURSOS HUMANOS': ['TH', 'RECURSOS HUMANOS'],
    'CALIDAD': ['CALIDAD'],
    'SST': ['SST']
  };

  hasAccessToNavItem(item: any): boolean {
    const userData = this.authService.userData();
    if (!userData) return false;

    const area = userData.area?.toUpperCase().trim() || '';
    const dept = userData.departament?.toUpperCase().trim() || '';

    if (this.isManagerWithFullAccess(area, dept)) {
      return true;
    }

    if (item.type === 'group') {
      return this.canAccessGroup(item.title, area);
    }

    if (item.type === 'collapse') {
      return this.canAccessCollapse(item.title, area, dept);
    }

    return true;
  }

  private isManagerWithFullAccess(area: string, dept: string): boolean {
    return area === 'GERENCIA' &&
      (dept === 'DESARROLLADOR DE PROYECTOS' || dept === 'ANALISTA DE PRESUPUESTO');
  }

  private canAccessGroup(rawTitle: string, area: string): boolean {
    const title = rawTitle?.toUpperCase().trim() || '';
    const allowedAreas = this.GROUP_AREA_MAP[title];
    // Si el grupo no está mapeado (ej. Panel de Control), se muestra a cualquier usuario
    if (!allowedAreas) return true;
    return allowedAreas.includes(area);
  }

  private canAccessCollapse(rawTitle: string, area: string, dept: string): boolean {
    const title = rawTitle?.toUpperCase().trim() || '';

    if (area === 'PRODUCCION') {
      if (dept === 'COSTOS' && title === 'GENERAR ETIQUETAS') return true;
      return title === dept;
    }

    if (area === 'LOGISTICA') {
      if (dept === 'LOGISTICA EXTERNA' && title === 'CASA CLIENTE') return true;
      if (dept === 'LOGISTICA INTERNA' && title === 'BODEGA') return true;
      return false;
    }

    return true;
  }

  private checkAccess(user: UserDataMenu, module: AppModule): boolean {
    const area = user.area?.toUpperCase().trim() || '';
    const dept = user.departament?.toUpperCase().trim() || '';

    if (area === 'GERENCIA' && (dept === 'DESARROLLADOR DE PROYECTOS' || dept === 'ANALISTA DE PRESUPUESTO')) {
      return true;
    }

    if (module === 'all') {
      return false;
    }

    // Regla: Si el módulo coincide con el área (en minúscula o mapeado), permitimos acceso
    if (area === 'PRODUCCION' && module === 'production') return true;
    if (area === 'PRODUCCION' && dept === 'COSTOS' && module === 'printing') return true;
    if (area === 'CALIDAD' && module === 'quality') return true;
    if (area === 'INGENIERIA INDUSTRIAL' && module === 'engineering') return true;
    if (area === 'SST' && module === 'health-safety') return true;
    if ((area === 'TH' || area === 'RECURSOS HUMANOS') && module === 'human-resources') return true;
    if (area === 'MANTENIMIENTO' && module === 'maintenance') return true;
    if ((area === 'MECANIZADO' || area === 'MECANICA') && module === 'machining') return true;
    if (area === 'ALMACEN' && module === 'inventories') return true;

    // Logística
    if (area === 'LOGISTICA') {
      if (dept === 'LOGISTICA EXTERNA' && module === 'clientHome') return true;
      if (dept === 'AUDITORIA' && module === 'clientHome') return true;
      if (dept === 'LOGISTICA INTERNA' && (module === 'inventories' || module === 'production')) return true;
      if (module === 'logistics') return true;
    }

    if (area === 'PLANEACIÓN' && module === 'production') return true;
    if (area === 'FINANCIERO' ) return true;

    return false;
  }

  getDefaultRouteForUser(): string {
    const routes = this.getAllowedRoutes();
    if (routes.length > 0) {
      return routes[0];
    }
    return '/auth/login';
  }
}
