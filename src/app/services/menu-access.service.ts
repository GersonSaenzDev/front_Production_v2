/* eslint-disable @typescript-eslint/no-explicit-any */
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
    // INGENIERIA INDUSTRIAL entra al grupo Producción para ver "Visualizar Ensamble";
    // el collapse Ensamble es el único que sobrevive (ver canAccessCollapse).
    'PRODUCCIÓN': ['PRODUCCION', 'INGENIERIA INDUSTRIAL'],
    'LOGÍSTICA': ['LOGISTICA'],
    'ALMACÉN': ['ALMACEN', 'LOGISTICA'],
    'MANTENIMIENTO': ['MANTENIMIENTO'],
    'MECANIZADO': ['MECANIZADO', 'MECANICA'],
    'INGENIERÍA': ['INGENIERIA INDUSTRIAL', 'INGENIERIA PRODUCTO', 'INGENIERIA DE PRODUCTO'],
    'RECURSOS HUMANOS': ['TH', 'RECURSOS HUMANOS'],
    'CALIDAD': ['CALIDAD'],
    'SST': ['SST', 'SEGURIDAD INDUSTRIAL'],
    // Grupos exclusivos por departamento (ver DEPARTMENT_ACCESS): ningún área los habilita
    'OXYPLAST': [],
    'COMPRAS': [],
    'GESTIÓN AMBIENTAL': [],
    'LABORATORIO DE ENSAYOS': [],
    'TUBERÍA': [],
    'MADERAS': [],
    'RIELES': []
  };

  // Mapeo: grupo top-level → departamentos autorizados (cuando el área no calza)
  // Útil cuando un usuario está en area=PRODUCCION pero su dept pertenece a otro grupo
  private readonly GROUP_DEPT_MAP: Record<string, string[]> = {
    'MECANIZADO': ['MECANICA']
  };

  // Acceso por DEPARTAMENTO (en MAYÚSCULAS). Tiene prioridad sobre la lógica por área.
  // - navTitles: títulos de los collapse del menú lateral que puede ver (en MAYÚSCULAS).
  // - modules: módulos a los que puede rutear (el guard usa esto).
  // Todos incluyen 'production' para poder ver el Dashboard (ruta /production) como pantalla principal.
  private readonly DEPARTMENT_ACCESS: Record<string, { navTitles: string[]; modules: AppModule[] }> = {
    'TROQUELADORAS': { navTitles: ['CRUDO'], modules: ['production'] },
    'PARRILLAS': { navTitles: ['CRUDO'], modules: ['production'] },
    'CORTE': { navTitles: ['CRUDO'], modules: ['production'] },
    'MECANIZADO VARIOS': { navTitles: ['SATÉLITES'], modules: ['production'] },
    'FUNDICION': { navTitles: ['SATÉLITES'], modules: ['production'] },
    'OXYPLAST': { navTitles: ['OXYPLAST'], modules: ['production'] },
    'COSTOS': { navTitles: ['GENERAR ETIQUETAS'], modules: ['production', 'printing'] },
    'COMPRAS': { navTitles: ['COMPRAS'], modules: ['production'] },
    'GESTION AMBIENTAL': { navTitles: ['GESTIÓN AMBIENTAL'], modules: ['production'] },
    'MECANICA': { navTitles: ['MECANIZADO'], modules: ['production', 'machining'] },
    'ALMACEN GENERAL': { navTitles: ['ALMACÉN'], modules: ['production', 'logistics'] },
    'LOGISTICA DE PROCESOS': { navTitles: ['ALMACÉN'], modules: ['production', 'logistics'] },
    'LOGISTICA INTERNA': { navTitles: ['ALMACÉN'], modules: ['production', 'logistics'] },
    'LABORATORIO DE ENSAYOS': { navTitles: ['LABORATORIO DE ENSAYOS'], modules: ['production'] },
    'TUB-COND-CUAL': { navTitles: ['TUBERÍA'], modules: ['production'] },
    'MADERAS': { navTitles: ['MADERAS'], modules: ['production'] },
    'RIELES': { navTitles: ['RIELES'], modules: ['production'] }
  };

  hasAccessToNavItem(item: any): boolean {
    const userData = this.authService.userData();
    if (!userData) return false;

    const area = userData.area?.toUpperCase().trim() || '';
    const dept = userData.departament?.toUpperCase().trim() || '';

    const isStadistics = this.isStadisticsNavItem(item);

    // ANALISTA DE PRESUPUESTO: solo ve el Dashboard y el menú Estadístico
    if (this.isBudgetAnalyst(area, dept)) {
      return isStadistics || this.isDashboardNavItem(item);
    }

    if (this.isManagerWithFullAccess(area, dept)) {
      return true;
    }

    // PLANEACIÓN (Producción) ve el menú Estadístico además de su acceso normal
    if (isStadistics && area === 'PRODUCCION' && dept === 'PLANEACION') {
      return true;
    }

    // El menú Estadístico es exclusivo de Desarrollo/Gerencias, Analista de Presupuesto y Planeación
    if (isStadistics) {
      return false;
    }

    // Prioridad: acceso configurado por departamento
    const deptAccess = this.DEPARTMENT_ACCESS[dept];
    if (deptAccess) {
      return this.canAccessNavItemByDepartment(item, deptAccess.navTitles);
    }

    if (item.type === 'group') {
      return this.canAccessGroup(item.title, area, dept);
    }

    if (item.type === 'collapse') {
      return this.canAccessCollapse(item.title, area, dept);
    }

    return true;
  }

  // Filtro de menú para usuarios mapeados por departamento.
  // Los grupos se dejan pasar (la limpieza de grupos vacíos en nav-content los descarta
  // si ningún collapse sobrevive); el filtro fino ocurre a nivel de collapse.
  private canAccessNavItemByDepartment(item: any, navTitles: string[]): boolean {
    if (item.type === 'collapse') {
      const title = item.title?.toUpperCase().trim() || '';
      return navTitles.includes(title);
    }
    // groups e items (el Dashboard de "Panel de Control" siempre visible)
    return true;
  }

  private isManagerWithFullAccess(area: string, dept: string): boolean {
    return area === 'GERENCIA' &&
      (dept === 'DESARROLLADOR DE PROYECTOS' || dept === 'GERENCIAS');
  }

  // ANALISTA DE PRESUPUESTO solo puede ver/entrar al menú Estadístico.
  private isBudgetAnalyst(area: string, dept: string): boolean {
    return area === 'GERENCIA' && dept === 'ANALISTA DE PRESUPUESTO';
  }

  // Identifica el grupo "Estadístico" y su item "Visualizar Novedades" (/stadistics).
  // Menú exclusivo de Desarrollo/Gerencias y Analista de Presupuesto.
  private isStadisticsNavItem(item: any): boolean {
    const title = item.title?.toUpperCase().trim() || '';
    if (item.type === 'group') {
      return title === 'ESTADÍSTICO';
    }
    return item.url === '/stadistics';
  }

  // Identifica el grupo "Panel de Control" y su item "Dashboard" (/production).
  private isDashboardNavItem(item: any): boolean {
    const title = item.title?.toUpperCase().trim() || '';
    if (item.type === 'group') {
      return title === 'PANEL DE CONTROL';
    }
    return item.url === '/production';
  }

  private canAccessGroup(rawTitle: string, area: string, dept: string): boolean {
    const title = rawTitle?.toUpperCase().trim() || '';
    const allowedAreas = this.GROUP_AREA_MAP[title];
    // Si el grupo no está mapeado (ej. Panel de Control), se muestra a cualquier usuario
    if (!allowedAreas) return true;
    if (allowedAreas.includes(area)) return true;
    // Override por departamento (ej. dept MECANICA en area PRODUCCION accede a Mecanizado)
    const allowedDepts = this.GROUP_DEPT_MAP[title];
    return allowedDepts ? allowedDepts.includes(dept) : false;
  }

  private canAccessCollapse(rawTitle: string, area: string, dept: string): boolean {
    const title = rawTitle?.toUpperCase().trim() || '';

    if (area === 'PRODUCCION') {
      if (dept === 'COSTOS' && title === 'GENERAR ETIQUETAS') return true;
      if (dept === 'HIDRAULICAS' && title === 'GENERAR ETIQUETAS') return true;
      if (dept === 'HIDRAULICAS' && title === 'CRUDO') return true;
      if (dept === 'TROQUELADORAS' && title === 'CRUDO') return true;
      if ((dept === 'ARSOL' || dept === 'ACABADOS PINTURA' || dept === 'ACABADOS ESMALTE') && title === 'ACABADOS') return true;
      if (dept === 'PLANEACION' && title === 'ENSAMBLE') return true;
      return title === dept;
    }

    if (area === 'LOGISTICA') {
      if (dept === 'LOGISTICA EXTERNA' && title === 'CASA CLIENTE') return true;
      if (dept === 'LOGISTICA INTERNA' && title === 'BODEGA') return true;
      return false;
    }

    // INGENIERIA INDUSTRIAL ve sus dos collapses de Ingeniería + el collapse "Ensamble"
    // de Producción (para "Visualizar Ensamble"); el resto de Producción queda oculto.
    if (area === 'INGENIERIA INDUSTRIAL') {
      return ['INGENIERÍA DE PRODUCTO', 'INGENIERÍA INDUSTRIAL', 'ENSAMBLE'].includes(title);
    }

    return true;
  }

  private checkAccess(user: UserDataMenu, module: AppModule): boolean {
    const area = user.area?.toUpperCase().trim() || '';
    const dept = user.departament?.toUpperCase().trim() || '';

    if (area === 'GERENCIA' && (dept === 'DESARROLLADOR DE PROYECTOS' || dept === 'GERENCIAS')) {
      return true;
    }

    // ANALISTA DE PRESUPUESTO: solo el Dashboard (production); el Estadístico (/stadistics) va fuera de validModules
    if (this.isBudgetAnalyst(area, dept)) {
      return module === 'production';
    }

    if (module === 'all') {
      return false;
    }

    // El Dashboard vive en el módulo 'production' y es la pantalla principal de la app
    // (la raíz '' redirige a /production). Por eso CUALQUIER usuario autenticado puede
    // entrar a /production; el menú sigue restringiendo qué sub-secciones de Producción ve.
    if (module === 'production') {
      return true;
    }

    // Prioridad: acceso configurado por departamento
    const deptAccess = this.DEPARTMENT_ACCESS[dept];
    if (deptAccess) {
      return deptAccess.modules.includes(module);
    }

    // Regla: Si el módulo coincide con el área (en minúscula o mapeado), permitimos acceso.
    // El módulo 'production' (Dashboard) ya se concedió arriba a todos, por eso no se repite aquí.
    if (area === 'PRODUCCION' && dept === 'COSTOS' && module === 'printing') return true;
    if (area === 'CALIDAD' && module === 'quality') return true;
    if ((area === 'INGENIERIA INDUSTRIAL' || area === 'INGENIERIA PRODUCTO' || area === 'INGENIERIA DE PRODUCTO') && module === 'engineering') return true;
    if ((area === 'SST' || area === 'SEGURIDAD INDUSTRIAL') && module === 'health-safety') return true;
    if ((area === 'TH' || area === 'RECURSOS HUMANOS') && module === 'human-resources') return true;
    if (area === 'MANTENIMIENTO' && module === 'maintenance') return true;
    if ((area === 'MECANIZADO' || area === 'MECANICA') && module === 'machining') return true;
    if (dept === 'MECANICA' && module === 'machining') return true;
    if (area === 'ALMACEN' && module === 'inventories') return true;

    // Logística
    if (area === 'LOGISTICA') {
      if (dept === 'LOGISTICA EXTERNA' && module === 'clientHome') return true;
      if (dept === 'AUDITORIA' && module === 'clientHome') return true;
      if (dept === 'LOGISTICA INTERNA' && module === 'inventories') return true;
      if (module === 'logistics') return true;
    }

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
