import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SharedNewsComponent } from '../../theme/layout/admin/navigation/shared-news/shared-news.component';

/**
 * Formulario de creación de novedades atado a una subárea concreta.
 * Lee `area` y `subArea` desde la `data` de la ruta y los inyecta al componente compartido,
 * que bloquea el origen para que el operario solo reporte por su subárea.
 */
@Component({
  selector: 'app-subarea-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './subarea-news.html'
})
export class SubAreaNews {
  private route = inject(ActivatedRoute);
  readonly area: string = this.route.snapshot.data['area'] ?? '';
  readonly subArea: string = this.route.snapshot.data['subArea'] ?? '';
}
