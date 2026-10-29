import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MenuAccessService } from '../services/menu-access.service';

/**
 * Restringe "Solicitud Herramental (SME)" y "Gestión de Solicitudes" al Jefe de Mecánica. Un
 * mecánico/auxiliar solo debe entrar a "Cargue de Intervención" para registrar su trabajo.
 * Complementa el ocultamiento del item en el menú (MenuAccessService.isMechanicsJefeOnlyNavItem):
 * este guard bloquea también la entrada por URL directa.
 */
export const mechanicsJefeOnlyGuard: CanActivateFn = () => {
  const menuAccessService = inject(MenuAccessService);
  const router = inject(Router);

  if (!menuAccessService.isMechanicsTechnician()) {
    return true;
  }

  router.navigate(['machining/mechanicsUpload']);
  return false;
};
