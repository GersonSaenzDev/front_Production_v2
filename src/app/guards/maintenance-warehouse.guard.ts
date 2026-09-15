import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MenuAccessService } from '../services/menu-access.service';

/**
 * Restringe la entrada al Almacén de Mantenimiento (entrega de repuestos/materiales por
 * solicitud) a la lista puntual de usuarios autorizados (ver MAINTENANCE_WAREHOUSE_USERS en
 * MenuAccessService). A diferencia del resto del módulo Mantenimiento (abierto a toda el
 * área), aquí se maneja quién entrega/recibe y queda en auditoría: son datos sensibles, por
 * eso el acceso NO se hereda solo por pertenecer al área MANTENIMIENTO.
 *
 * Complementa (no reemplaza) el ocultamiento del item en el menú lateral: este guard bloquea
 * también la entrada por URL directa.
 */
export const maintenanceWarehouseGuard: CanActivateFn = () => {
  const menuAccessService = inject(MenuAccessService);
  const router = inject(Router);

  if (menuAccessService.canAccessMaintenanceWarehouse()) {
    return true;
  }

  router.navigate([menuAccessService.getDefaultRouteForUser()]);
  return false;
};
