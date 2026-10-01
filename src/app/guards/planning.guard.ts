import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MenuAccessService } from '../services/menu-access.service';

/**
 * Restringe las rutas de Planeación (/production/planning/* y /production/planningLoad) a
 * quienes ven el grupo Planeación en el menú (ver canAccessPlanning en MenuAccessService).
 * El módulo 'production' está abierto a todos por el Dashboard, por eso sin este guard
 * cualquier usuario (ej. Laboratorio de Ensayos) podía entrar escribiendo la URL.
 *
 * Complementa (no reemplaza) el ocultamiento de los items en el menú lateral.
 */
export const planningGuard: CanActivateFn = () => {
  const menuAccessService = inject(MenuAccessService);
  const router = inject(Router);

  if (menuAccessService.canAccessPlanning()) {
    return true;
  }

  router.navigate([menuAccessService.getDefaultRouteForUser()]);
  return false;
};
