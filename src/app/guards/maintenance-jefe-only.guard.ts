import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MenuAccessService } from '../services/menu-access.service';

/**
 * Restringe "Novedades Mantenimiento" (crear solicitudes) y "Visualizar Novedades" (gestión
 * completa: asignar, aprobar, eliminar) al Jefe de Mantenimiento. Un técnico (typeUser
 * 'Empleado') solo debe entrar a "Cargue de Novedad" para registrar su propia intervención.
 *
 * Complementa (no reemplaza) el ocultamiento del item en el menú lateral (ver
 * MenuAccessService.isMaintenanceJefeOnlyNavItem): este guard bloquea también la entrada
 * por URL directa.
 */
export const maintenanceJefeOnlyGuard: CanActivateFn = () => {
  const menuAccessService = inject(MenuAccessService);
  const router = inject(Router);

  if (!menuAccessService.isMaintenanceTechnician()) {
    return true;
  }

  router.navigate(['maintenance/newsUpload']);
  return false;
};
