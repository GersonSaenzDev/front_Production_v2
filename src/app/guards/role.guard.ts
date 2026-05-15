import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MenuAccessService, AppModule } from '../services/menu-access.service';

export const roleGuard: CanActivateFn = (route, state) => {
  const menuAccessService = inject(MenuAccessService);
  const router = inject(Router);

  // Intentamos obtener el módulo que se quiere acceder desde la ruta.
  // Por ejemplo si la URL es /production, el módulo es 'production'
  const path = route.routeConfig?.path;
  
  if (path) {
    // Si la ruta coincide con uno de nuestros módulos, verificamos
    const validModules = ['production', 'inventories', 'printing', 'clientHome', 'quality', 'engineering', 'health-safety', 'human-resources', 'maintenance', 'machining', 'logistics'];
    if (validModules.includes(path)) {
      const module = path as AppModule;
      if (menuAccessService.hasAccessTo(module)) {
        return true;
      } else {
        // No tiene acceso, redireccionar a la ruta por defecto permitida
        const defaultRoute = menuAccessService.getDefaultRouteForUser();
        router.navigate([defaultRoute]);
        return false;
      }
    }
  }

  return true;
};
