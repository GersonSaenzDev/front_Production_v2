import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { catchError, map, of } from 'rxjs';
import { ExternalProductsService } from '../services/external-products.service';
import { MenuAccessService } from '../services/menu-access.service';

/**
 * Salida manual de Importaciones / Externos: única y exclusivamente el Eje de Bodega.
 *
 * La lista vive SOLO en el backend (EXTERNAL_EXIT_USERS, por defecto LYLEON): aquí se consulta
 * /storage/external/access. El backend además valida en /external/exit, así que este guard es
 * de experiencia de usuario, no la única barrera.
 */
export const externalExitGuard: CanActivateFn = () => {
  const externalService = inject(ExternalProductsService);
  const menuAccessService = inject(MenuAccessService);
  const router = inject(Router);
  const toastr = inject(ToastrService);

  const deny = () => {
    toastr.warning('La salida manual de producto externo es exclusiva del Eje de Bodega.', 'Acceso restringido');
    return router.createUrlTree([menuAccessService.getDefaultRouteForUser()]);
  };

  return externalService.getAccess().pipe(
    map((res) => (res.ok && res.data?.canManualExit ? true : deny())),
    catchError(() => of(deny()))
  );
};
