/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/services/menu-access.service.ts
import { Injectable, inject } from '@angular/core';
import { UserDataMenu } from '../interfaces/auth.interface';
import { AuthService } from './auth-services';

export type AppModule =
  | 'production'
  | 'inventories'
  | 'printing'
  | 'clientHome'
  | 'quality'
  | 'engineering'
  | 'health-safety'
  | 'human-resources'
  | 'maintenance'
  | 'machining'
  | 'logistics'
  | 'all';

// Perfiles de las cuentas de kiosco de Bodega (ver BODEGA_KIOSK_PROFILES)
type BodegaKioskProfile = 'INVENTARIO' | 'DESPACHOS';

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
    const modules: AppModule[] = [
      'production',
      'inventories',
      'printing',
      'clientHome',
      'quality',
      'engineering',
      'health-safety',
      'human-resources',
      'maintenance',
      'machining',
      'logistics'
    ];

    modules.forEach((m) => {
      if (this.hasAccessTo(m)) {
        allowed.push(`/${m}`);
      }
    });

    return allowed;
  }

  // Mapeo: grupo top-level → áreas autorizadas (en MAYÚSCULAS)
  // Los grupos no listados aquí son visibles para todos (ej. "Panel de Control")
  private readonly GROUP_AREA_MAP: Record<string, string[]> = {
    PLANEACIÓN: ['PRODUCCION'],
    // INGENIERIA INDUSTRIAL entra al grupo Producción para ver "Visualizar Ensamble";
    // el collapse Ensamble es el único que sobrevive (ver canAccessCollapse).
    PRODUCCIÓN: ['PRODUCCION', 'INGENIERIA INDUSTRIAL'],
    LOGÍSTICA: ['LOGISTICA'],
    ALMACÉN: ['ALMACEN', 'LOGISTICA'],
    MANTENIMIENTO: ['MANTENIMIENTO'],
    MECANIZADO: ['MECANIZADO', 'MECANICA'],
    INGENIERÍA: ['INGENIERIA INDUSTRIAL', 'INGENIERIA PRODUCTO', 'INGENIERIA DE PRODUCTO'],
    'GESTIÓN DE ESTRUCTURAS': ['INGENIERIA INDUSTRIAL', 'INGENIERIA PRODUCTO', 'INGENIERIA DE PRODUCTO'],
    'RECURSOS HUMANOS': ['TH', 'RECURSOS HUMANOS'],
    CALIDAD: ['CALIDAD'],
    SST: ['SST', 'SEGURIDAD INDUSTRIAL'],
    // Grupos exclusivos por departamento (ver DEPARTMENT_ACCESS): ningún área los habilita
    OXYPLAST: [],
    COMPRAS: [],
    'GESTIÓN AMBIENTAL': [],
    'LABORATORIO DE ENSAYOS': [],
    TUBERÍA: [],
    MADERAS: [],
    RIELES: []
  };

  // Mapeo: grupo top-level → departamentos autorizados (cuando el área no calza)
  // Útil cuando un usuario está en area=PRODUCCION pero su dept pertenece a otro grupo
  private readonly GROUP_DEPT_MAP: Record<string, string[]> = {
    MECANIZADO: ['MECANICA']
  };

  // Excepción puntual: usuarios de LOGISTICA EXTERNA (normalmente solo ven CASA CLIENTE)
  // que además deben ver el collapse BODEGA. Identificados por userApp (username de login).
  private readonly LOGISTICA_EXTERNA_BODEGA_USERS = ['DSPULGARIN', 'DEVERDUGO'];

  private isLogisticaExternaBodegaUser(userApp?: string): boolean {
    const code = userApp?.toUpperCase().trim() || '';
    return this.LOGISTICA_EXTERNA_BODEGA_USERS.includes(code);
  }

  // Usuarios de OTRAS áreas (ej. Jefatura de Producción) que, además de su menú
  // normal, deben ver el collapse BODEGA para consultar las entregas de producto a
  // bodega (Dashboard Inventarios, novedades, etc.). Permiso ADITIVO: no reemplaza
  // el menú propio del área/depto, solo suma el grupo Logística → Bodega. Se
  // identifican por userApp (username de login), sin importar area/departamento.
  private readonly BODEGA_VIEWER_USERS = ['ACPEÑA'];

  private isBodegaViewerUser(userApp?: string): boolean {
    const code = userApp?.toUpperCase().trim() || '';
    return this.BODEGA_VIEWER_USERS.includes(code);
  }

  // Usuarios de OTRAS áreas que, además de su menú normal, deben ver el menú
  // Estadístico → Visualizar Novedades (/stadistics). Permiso ADITIVO por userApp
  // (username de login), sin importar area/departamento.
  private readonly STADISTICS_VIEWER_USERS = ['ACPEÑA'];

  private isStadisticsViewerUser(userApp?: string): boolean {
    const code = userApp?.toUpperCase().trim() || '';
    return this.STADISTICS_VIEWER_USERS.includes(code);
  }

  // Lista PUNTUAL de usuarios autorizados a entrar al Almacén de Mantenimiento (entrega de
  // repuestos/materiales por solicitud: qué se entrega, quién entrega y quién recibe).
  // Acceso EXCLUSIVO y restrictivo (al revés de BODEGA_VIEWER_USERS): ni siquiera el resto
  // del área MANTENIMIENTO lo ve por defecto, por tratarse de datos sensibles/de auditoría.
  // Se identifican por userApp (username de login). Gerencia/Desarrollo siempre tiene acceso
  // (ver isManagerWithFullAccess) sin necesidad de estar en esta lista.
  // TODO (Gerson): agregar aquí el userApp de cada persona autorizada, ej: 'JPEREZ'.
  private readonly MAINTENANCE_WAREHOUSE_USERS: string[] = [];

  private isMaintenanceWarehouseUser(userApp?: string): boolean {
    const code = userApp?.toUpperCase().trim() || '';
    return this.MAINTENANCE_WAREHOUSE_USERS.includes(code);
  }

  /**
   * Acceso exclusivo al Almacén de Mantenimiento: Gerencia/Desarrollo (acceso total) o la
   * lista puntual MAINTENANCE_WAREHOUSE_USERS. Lo usa tanto el filtro de menú (item oculto
   * para el resto) como el guard de la ruta (bloquea entrar por URL directa).
   */
  canAccessMaintenanceWarehouse(): boolean {
    const userData = this.authService.userData();
    if (!userData) return false;
    const area = userData.area?.toUpperCase().trim() || '';
    const dept = userData.departament?.toUpperCase().trim() || '';
    if (this.isManagerWithFullAccess(area, dept)) return true;
    return this.isMaintenanceWarehouseUser(userData.userApp);
  }

  // Usuarios del área de Producción autorizados a ver y usar Planeación (Cargue, Dashboard,
  // Mensual, Valorización), identificados por userApp (username de login). El resto del área
  // PRODUCCION y de los demás departamentos NO la ve.
  private readonly PLANNING_PRODUCTION_USERS = ['ACPEÑA', 'JAPONTE'];

  /**
   * Acceso a Planeación: menú (grupo Planeación) y rutas /production/planning/* y
   * /production/planningLoad (planningGuard bloquea la entrada por URL directa).
   * Solo: Gerencia/Desarrollo, Analista de Presupuesto, departamento PLANEACION y
   * PLANNING_PRODUCTION_USERS.
   */
  canAccessPlanning(): boolean {
    const userData = this.authService.userData();
    if (!userData) return false;
    const area = userData.area?.toUpperCase().trim() || '';
    const dept = userData.departament?.toUpperCase().trim() || '';
    if (this.isManagerWithFullAccess(area, dept) || this.isBudgetAnalyst(area, dept)) return true;
    if (dept === 'PLANEACION') return true;
    const code = userData.userApp?.toUpperCase().trim() || '';
    return this.PLANNING_PRODUCTION_USERS.includes(code);
  }

  // Identifica el item de menú "Almacén de Mantenimiento" (url dedicada, ver navigation.ts).
  private isMaintenanceWarehouseNavItem(item: any): boolean {
    return item.type === 'item' && item.url === 'maintenance/maintenanceWarehouse';
  }

  /**
   * Técnico de Mantenimiento: pertenece al área MANTENIMIENTO pero NO es el Jefe (typeUser
   * distinto de 'Jefe', ej. 'Empleado'). Solo debe ver/entrar a "Cargue de Novedad" (registrar
   * su propia intervención en lo que se le asignó); el resto del módulo (crear solicitudes,
   * ver todo, asignar, aprobar, Almacén) es exclusivo del Jefe.
   *
   * Restricción deliberadamente conservadora: si `typeUser` no viene (sesión guardada antes de
   * este cambio, o dato de RH incompleto) se trata como Jefe (acceso completo, el
   * comportamiento de siempre) en vez de bloquear a alguien que hoy sí tiene acceso. Tras un
   * login/refresh nuevo el token ya trae `typeUser` y la restricción aplica.
   */
  isMaintenanceTechnician(): boolean {
    const userData = this.authService.userData();
    if (!userData) return false;
    const area = userData.area?.toUpperCase().trim() || '';
    const typeUser = userData.typeUser?.toUpperCase().trim() || '';
    return area === 'MANTENIMIENTO' && typeUser === 'EMPLEADO';
  }

  // Items del menú de Mantenimiento exclusivos del Jefe (crear solicitudes / ver todo, asignar,
  // aprobar). Un técnico solo debe ver "Cargue de Novedad" (ver isMaintenanceTechnician).
  private isMaintenanceJefeOnlyNavItem(item: any): boolean {
    const url = item.url || '';
    return url === 'maintenance/maintenanceNews' || url === 'maintenance/viewNews';
  }

  // Items del menú que componen el collapse "Bodega" (grupo Logística + collapse
  // Bodega + sus items), usado por el permiso aditivo BODEGA_VIEWER_USERS. No
  // incluye los collapses "Casa Cliente" ni "Almacén" del mismo grupo.
  private isBodegaNavItem(item: any): boolean {
    const title = item.title?.toUpperCase().trim() || '';
    if (item.type === 'group') return title === 'LOGÍSTICA';
    if (item.type === 'collapse') return title === 'BODEGA';
    const url = item.url || '';
    return (
      url.startsWith('inventories/') ||
      url === 'production/wineryNews' ||
      url === 'clientHome/freightManagement' ||
      url === 'clientHome/carrierManagement'
    );
  }

  // Subgrupos del collapse BODEGA en navigation.ts (id con prefijo 'bodega-sub-'): Recepción
  // de Producción, Despachos, Inventarios, Novedades y Transporte.
  private readonly BODEGA_SUBGROUP_PREFIX = 'bodega-sub-';

  // Perfiles de kiosco de Bodega (logins compartidos de equipo, no de una persona): ven el
  // collapse BODEGA y entran al módulo 'inventories' sin importar el area/departamento que
  // traigan del RH, pero SOLO a los subgrupos y rutas de su perfil.
  // - subgroups: ids 'bodega-sub-*' visibles en el menú.
  // - urls: LISTA BLANCA de rutas (URL exacta, sin query). Todo lo demás se bloquea en
  //   kioskRouteGuard, incluso escribiendo la URL a mano; también oculta en el menú los items
  //   que no estén aquí. Siempre incluye '/production' (Dashboard).
  // - home: a dónde se redirige cuando intenta entrar a una ruta no permitida.
  private readonly BODEGA_KIOSK_PROFILES: Record<BodegaKioskProfile, { subgroups: string[]; urls: string[]; home: string }> = {
    // Tablets del lector: Recepción de Producción + Inventarios
    INVENTARIO: {
      subgroups: ['bodega-sub-recepcion', 'bodega-sub-inventarios'],
      urls: [
        '/production',
        '/inventories/packingList',
        '/inventories/barcodeReader',
        '/inventories/dash',
        '/inventories/enterInventory',
        '/inventories/finalInventoryReport'
      ],
      home: '/inventories/enterInventory'
    },
    // Cargue en muelle y prealistamiento: Despachos. "Órdenes de Cargue" queda fuera porque es
    // administración de Bodega (warehouseAdminGuard / WAREHOUSE_ADMIN_USERS en el backend).
    DESPACHOS: {
      subgroups: ['bodega-sub-despachos'],
      urls: ['/production', '/inventories/loadingOrderPicking', '/inventories/orderPreparation'],
      home: '/inventories/loadingOrderPicking'
    }
  };

  // userApp (login, en MAYÚSCULAS) → perfil de kiosco
  private readonly BODEGA_KIOSK_USERS: Record<string, BodegaKioskProfile> = {
    INVENBODEGA1: 'INVENTARIO',
    INVENBODEGA2: 'INVENTARIO',
    INVENBODEGA3: 'INVENTARIO',
    INVENBODEGA4: 'INVENTARIO',
    INVENBODEGA5: 'INVENTARIO',
    CARGUEMUELLE1: 'DESPACHOS',
    CARGUEMUELLE2: 'DESPACHOS',
    PREBODEGA1: 'DESPACHOS',
    PREBODEGA2: 'DESPACHOS'
  };

  /** true si la sesión actual es una cuenta de kiosco de Bodega (invenbodega, carguemuelle, prebodega). */
  isKioskSession(): boolean {
    return !!this.getBodegaKioskProfile(this.authService.userData()?.userApp);
  }

  /** Rutas permitidas para el kiosco de la sesión actual (vacío si no es kiosco). */
  getKioskAllowedUrls(): readonly string[] {
    return this.getBodegaKioskProfile(this.authService.userData()?.userApp)?.urls ?? [];
  }

  /** Pantalla de inicio del kiosco de la sesión actual. */
  getKioskHomeUrl(): string {
    return this.getBodegaKioskProfile(this.authService.userData()?.userApp)?.home ?? '/production';
  }

  private isBodegaSubgroupNavItem(item: any): boolean {
    return item.type === 'collapse' && String(item.id || '').startsWith(this.BODEGA_SUBGROUP_PREFIX);
  }

  private getBodegaKioskProfile(userApp?: string) {
    const code = userApp?.toUpperCase().trim() || '';
    const profile = this.BODEGA_KIOSK_USERS[code];
    return profile ? this.BODEGA_KIOSK_PROFILES[profile] : undefined;
  }

  private isBodegaKioskUser(userApp?: string): boolean {
    return !!this.getBodegaKioskProfile(userApp);
  }

  // Acceso por DEPARTAMENTO (en MAYÚSCULAS). Tiene prioridad sobre la lógica por área.
  // - navTitles: títulos de los collapse del menú lateral que puede ver (en MAYÚSCULAS).
  // - modules: módulos a los que puede rutear (el guard usa esto).
  // Todos incluyen 'production' para poder ver el Dashboard (ruta /production) como pantalla principal.
  private readonly DEPARTMENT_ACCESS: Record<string, { navTitles: string[]; modules: AppModule[] }> = {
    // PLANEACION: solo el grupo Planeación (collapse "Cargue" + item "Dashboard Planeación")
    // y el menú Estadístico (ver excepción en hasAccessToNavItem); el resto queda oculto.
    PLANEACION: {
      navTitles: ['CARGUE', 'GESTIÓN DE ESTRUCTURAS', 'PLANIFICACIÓN Y CAPACIDAD', 'AUDITORÍA DE COSTOS'],
      modules: ['production', 'engineering']
    },
    TROQUELADORAS: { navTitles: ['CRUDO'], modules: ['production'] },
    PARRILLAS: { navTitles: ['CRUDO'], modules: ['production'] },
    CORTE: { navTitles: ['CRUDO'], modules: ['production'] },
    'MECANIZADO VARIOS': { navTitles: ['SATÉLITES'], modules: ['production'] },
    FUNDICION: { navTitles: ['SATÉLITES'], modules: ['production'] },
    OXYPLAST: { navTitles: ['OXYPLAST'], modules: ['production'] },
    COSTOS: { navTitles: ['GENERAR ETIQUETAS'], modules: ['production', 'printing'] },
    COMPRAS: { navTitles: ['COMPRAS'], modules: ['production'] },
    'GESTION AMBIENTAL': { navTitles: ['GESTIÓN AMBIENTAL'], modules: ['production'] },
    MECANICA: { navTitles: ['MECANIZADO'], modules: ['production', 'machining'] },
    'ALMACEN GENERAL': { navTitles: ['ALMACÉN'], modules: ['production', 'logistics'] },
    'LOGISTICA DE PROCESOS': { navTitles: ['ALMACÉN'], modules: ['production', 'logistics'] },
    'LOGISTICA INTERNA': {
      navTitles: ['BODEGA', 'CASA CLIENTE', 'ALMACÉN'],
      modules: ['production', 'inventories', 'clientHome', 'logistics']
    },
    'LABORATORIO DE ENSAYOS': { navTitles: ['LABORATORIO DE ENSAYOS'], modules: ['production'] },
    'TUB-COND-CUAL': { navTitles: ['TUBERÍA'], modules: ['production'] },
    MADERAS: { navTitles: ['MADERAS'], modules: ['production'] },
    RIELES: { navTitles: ['RIELES'], modules: ['production'] }
  };

  hasAccessToNavItem(item: any): boolean {
    const userData = this.authService.userData();
    if (!userData) return false;

    const area = userData.area?.toUpperCase().trim() || '';
    const dept = userData.departament?.toUpperCase().trim() || '';

    // Subgrupos del collapse BODEGA: heredan el acceso ya decidido para BODEGA (el filtro
    // recursivo de nav-content solo evalúa los hijos si el padre pasó). Va primero porque
    // las reglas por título de collapse (área, departamento, analista...) no los conocen y
    // los ocultarían. Excepción: los kioscos solo ven los subgrupos de su perfil.
    const kioskProfile = this.getBodegaKioskProfile(userData.userApp);
    if (this.isBodegaSubgroupNavItem(item)) {
      return kioskProfile ? kioskProfile.subgroups.includes(item.id) : true;
    }

    const isStadistics = this.isStadisticsNavItem(item);

    // ANALISTA DE PRESUPUESTO: ve el Dashboard, el menú Estadístico, el menú Planeación,
    // el menú Gestión de Estructuras y el menú Logística (Bodega, Casa Cliente, Almacén)
    if (this.isBudgetAnalyst(area, dept)) {
      return (
        isStadistics ||
        this.isDashboardNavItem(item) ||
        this.isPlanningNavItem(item) ||
        this.isStructureManagementNavItem(item) ||
        this.isLogisticsNavItem(item)
      );
    }

    if (this.isManagerWithFullAccess(area, dept)) {
      return true;
    }

    // Item exclusivo de Almacén de Mantenimiento (datos sensibles de entrega/recepción de
    // repuestos): requiere estar en la lista puntual de autorizados, sin importar el área o
    // departamento; ni siquiera el resto de Mantenimiento lo ve por defecto. Va antes de
    // cualquier lógica por área/departamento para que la restrinja de forma incondicional.
    if (this.isMaintenanceWarehouseNavItem(item)) {
      return this.isMaintenanceWarehouseUser(userData.userApp);
    }

    // Un técnico de Mantenimiento (no Jefe) no debe ver "Novedades Mantenimiento" (crear
    // solicitudes) ni "Visualizar Novedades" (gestión completa): solo su "Cargue de Novedad".
    if (this.isMaintenanceJefeOnlyNavItem(item)) {
      return !this.isMaintenanceTechnician();
    }

    // PLANEACIÓN ve el menú Estadístico además de su acceso normal (independiente del área)
    if (isStadistics && dept === 'PLANEACION') {
      return true;
    }

    // Permiso aditivo por usuario (STADISTICS_VIEWER_USERS) para ver el menú Estadístico
    if (isStadistics && this.isStadisticsViewerUser(userData.userApp)) {
      return true;
    }

    // El menú Estadístico es exclusivo de Desarrollo/Gerencias, Analista de Presupuesto,
    // Planeación y los usuarios de STADISTICS_VIEWER_USERS
    if (isStadistics) {
      return false;
    }

    // Kiosco de Bodega: se trata como un "departamento virtual" que solo ve el
    // collapse BODEGA (además del Dashboard, siempre visible), sin importar el
    // area/departamento real que traiga del RH. Va después del filtro de Estadístico
    // (exclusivo de Desarrollo/Gerencias/Planeación) para no heredar ese menú. Los items
    // se filtran con la lista blanca de URLs del perfil (ej. Despachos sin Órdenes de Cargue).
    if (kioskProfile) {
      if (item.type === 'item' && item.url) {
        const url = item.url.startsWith('/') ? item.url : `/${item.url}`;
        return kioskProfile.urls.includes(url);
      }
      return this.canAccessNavItemByDepartment(item, ['BODEGA']);
    }

    // Permiso aditivo: usuarios que además de su menú normal deben ver el collapse
    // BODEGA (ej. Jefatura de Producción). Va antes del filtro por departamento para
    // que los items de Bodega pasen; el resto de items sigue la lógica normal del
    // área/depto más abajo.
    if (this.isBodegaViewerUser(userData.userApp) && this.isBodegaNavItem(item)) {
      return true;
    }

    // Prioridad: acceso configurado por departamento
    // Planeación (grupo, collapse "Cargue" e items sueltos): regla única compartida con
    // planningGuard. Va antes del filtro por departamento porque los items sueltos del grupo
    // (Dashboard, Mensual, Valorización) no son collapses y ese filtro los dejaba pasar a todos.
    if (this.isPlanningNavItem(item)) {
      return this.canAccessPlanning();
    }

    const deptAccess = this.DEPARTMENT_ACCESS[dept];
    if (deptAccess) {
      return this.canAccessNavItemByDepartment(item, deptAccess.navTitles);
    }

    if (item.type === 'group') {
      return this.canAccessGroup(item.title, area, dept);
    }

    if (item.type === 'collapse') {
      return this.canAccessCollapse(item.title, area, dept, userData.userApp);
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
    return area === 'GERENCIA' && (dept === 'DESARROLLADOR DE PROYECTOS' || dept === 'GERENCIAS');
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

  // Identifica el grupo "Planeación" y sus items (collapse "Cargue", "Planeacion Producción",
  // "Dashboard Planeación", "Planeación Mensual", "Valorización de Planeación").
  private isPlanningNavItem(item: any): boolean {
    const title = item.title?.toUpperCase().trim() || '';
    if (item.type === 'group') {
      return title === 'PLANEACIÓN';
    }
    if (item.type === 'collapse') {
      return title === 'CARGUE';
    }
    const url = item.url || '';
    return url === 'production/planningLoad' || url.startsWith('production/planning/');
  }

  // Identifica el grupo "Gestión de Estructuras" y sus 3 collapses (Gestión de Estructuras,
  // Planificación y Capacidad, Auditoría de Costos) con todos sus items.
  private isStructureManagementNavItem(item: any): boolean {
    const title = item.title?.toUpperCase().trim() || '';
    if (item.type === 'group' || item.type === 'collapse') {
      return title === 'GESTIÓN DE ESTRUCTURAS' || title === 'PLANIFICACIÓN Y CAPACIDAD' || title === 'AUDITORÍA DE COSTOS';
    }
    return (item.url || '').startsWith('engineering/structureManagements');
  }

  // Identifica el grupo "Logística" y sus 3 collapses (Bodega, Casa Cliente, Almacén)
  // con todos sus items.
  private isLogisticsNavItem(item: any): boolean {
    const title = item.title?.toUpperCase().trim() || '';
    if (item.type === 'group') {
      return title === 'LOGÍSTICA';
    }
    if (item.type === 'collapse') {
      return title === 'BODEGA' || title === 'CASA CLIENTE' || title === 'ALMACÉN';
    }
    const url = item.url || '';
    return (
      url.startsWith('inventories/') || url.startsWith('clientHome/') || url.startsWith('logistics/') || url === 'production/wineryNews'
    );
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

  private canAccessCollapse(rawTitle: string, area: string, dept: string, userApp?: string): boolean {
    const title = rawTitle?.toUpperCase().trim() || '';

    if (area === 'PRODUCCION') {
      if (dept === 'COSTOS' && title === 'GENERAR ETIQUETAS') return true;
      if (dept === 'HIDRAULICAS' && title === 'GENERAR ETIQUETAS') return true;
      if (dept === 'HIDRAULICAS' && title === 'CRUDO') return true;
      if (dept === 'TROQUELADORAS' && title === 'CRUDO') return true;
      if ((dept === 'ARSOL' || dept === 'ACABADOS PINTURA' || dept === 'ACABADOS ESMALTE') && title === 'ACABADOS') return true;
      if (dept === 'PLANEACION' && title === 'ENSAMBLE') return true;
      if (dept === 'PLANEACION' && (title === 'CARGUE' || title === 'DASHBOARD PLANEACIÓN')) return true;
      return title === dept;
    }

    if (area === 'LOGISTICA') {
      if (dept === 'LOGISTICA EXTERNA' && title === 'CASA CLIENTE') return true;
      if (dept === 'LOGISTICA INTERNA' && title === 'BODEGA') return true;
      if (dept === 'LOGISTICA EXTERNA' && title === 'BODEGA' && this.isLogisticaExternaBodegaUser(userApp)) return true;
      return false;
    }

    // INGENIERIA INDUSTRIAL ve sus dos collapses de Ingeniería + el collapse "Ensamble"
    // de Producción (para "Visualizar Ensamble") + "Gestión de Estructuras"; el resto de
    // Producción queda oculto.
    if (area === 'INGENIERIA INDUSTRIAL') {
      return [
        'INGENIERÍA DE PRODUCTO',
        'INGENIERÍA INDUSTRIAL',
        'ENSAMBLE',
        'GESTIÓN DE ESTRUCTURAS',
        'PLANIFICACIÓN Y CAPACIDAD',
        'AUDITORÍA DE COSTOS'
      ].includes(title);
    }

    return true;
  }

  private checkAccess(user: UserDataMenu, module: AppModule): boolean {
    const area = user.area?.toUpperCase().trim() || '';
    const dept = user.departament?.toUpperCase().trim() || '';

    // Kiosco de Bodega: solo módulos 'production' (Dashboard) e 'inventories' (Bodega),
    // sin importar area/departamento. Se resuelve antes que cualquier otra regla.
    if (this.isBodegaKioskUser(user.userApp)) {
      return module === 'production' || module === 'inventories';
    }

    // Permiso aditivo para ver el collapse BODEGA desde otra área (ej. Jefatura de
    // Producción): habilita el ruteo a /inventories y /clientHome (los items de
    // Fletes viven dentro del collapse Bodega). El resto de módulos sigue la lógica
    // normal más abajo.
    if (this.isBodegaViewerUser(user.userApp) && (module === 'inventories' || module === 'clientHome')) {
      return true;
    }

    if (area === 'GERENCIA' && (dept === 'DESARROLLADOR DE PROYECTOS' || dept === 'GERENCIAS')) {
      return true;
    }

    // ANALISTA DE PRESUPUESTO: Dashboard (production), Gestión de Estructuras (engineering)
    // y Logística (inventories = Bodega, clientHome = Casa Cliente, logistics = Almacén);
    // el Estadístico (/stadistics) va fuera de validModules
    if (this.isBudgetAnalyst(area, dept)) {
      return (
        module === 'production' || module === 'engineering' || module === 'inventories' || module === 'clientHome' || module === 'logistics'
      );
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
    if (area === 'PRODUCCION' && dept === 'PLANEACION' && module === 'inventories') return true;
    if (area === 'CALIDAD' && module === 'quality') return true;
    if (
      (area === 'INGENIERIA INDUSTRIAL' || area === 'INGENIERIA PRODUCTO' || area === 'INGENIERIA DE PRODUCTO') &&
      module === 'engineering'
    )
      return true;
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
      if (dept === 'LOGISTICA EXTERNA' && module === 'inventories' && this.isLogisticaExternaBodegaUser(user.userApp)) return true;
      if (module === 'logistics') return true;
    }

    if (area === 'FINANCIERO') return true;

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
