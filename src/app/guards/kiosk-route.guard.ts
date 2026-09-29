import { inject } from '@angular/core';
import { CanActivateChildFn, PRIMARY_OUTLET, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MenuAccessService } from '../services/menu-access.service';

/**
 * Cuentas de kiosco de Bodega (invenbodega1..5, carguemuelle1..2, prebodega1..2): solo
 * pueden navegar a la LISTA BLANCA de su perfil (MenuAccessService.getKioskAllowedUrls). Ocultar el menú
 * no basta: este guard bloquea también la entrada escribiendo la URL a mano.
 *
 * Va como canActivateChild en la ruta raíz del layout (app-routing.module.ts), así cubre
 * todos los módulos, incluso rutas que se agreguen en el futuro. Para cualquier otro usuario
 * no hace nada (sus accesos siguen en roleGuard y los guards de cada pantalla).
 */
export const kioskRouteGuard: CanActivateChildFn = (_childRoute, state) => {
  const menuAccessService = inject(MenuAccessService);

  if (!menuAccessService.isKioskSession()) {
    return true;
  }

  const router = inject(Router);
  // Ruta exacta sin query params ni fragmento (ej. '/inventories/enterInventory')
  const segments = router.parseUrl(state.url).root.children[PRIMARY_OUTLET]?.segments ?? [];
  const path = '/' + segments.map((s) => s.path).join('/');

  if (menuAccessService.getKioskAllowedUrls().includes(path)) {
    return true;
  }

  inject(ToastrService).warning('Esta cuenta de kiosco solo tiene acceso a su sección de Bodega.', 'Acceso restringido');
  return router.createUrlTree([menuAccessService.getKioskHomeUrl()]);
};
