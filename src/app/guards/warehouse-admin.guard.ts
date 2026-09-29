import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { catchError, map, of } from 'rxjs';
import { DashInventoryServices } from '../services/dashInventory-services';
import { MenuAccessService } from '../services/menu-access.service';

/**
 * Restringe las pantallas de administración de Órdenes de Cargue (cargue del .PRN, cola,
 * auditoría y cierre parcial) a los administrativos de Bodega.
 *
 * La lista de usuarios vive SOLO en el backend (WAREHOUSE_ADMIN_USERS): aquí se consulta
 * /storage/loadingOrders/access en lugar de replicarla. El backend además valida el rol en
 * cada endpoint, así que este guard es de experiencia de usuario, no la única barrera.
 */
export const warehouseAdminGuard: CanActivateFn = () => {
  const inventoryService = inject(DashInventoryServices);
  const menuAccessService = inject(MenuAccessService);
  const router = inject(Router);
  const toastr = inject(ToastrService);

  const deny = () => {
    toastr.warning('No tiene permisos de administrativo de Bodega.', 'Acceso restringido');
    return router.createUrlTree([menuAccessService.getDefaultRouteForUser()]);
  };

  return inventoryService.getLoadingOrderAccess().pipe(
    map((res) => (res.ok && res.data?.isWarehouseAdmin ? true : deny())),
    catchError(() => of(deny()))
  );
};
