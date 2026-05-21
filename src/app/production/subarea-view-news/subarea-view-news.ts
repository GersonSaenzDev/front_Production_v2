import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SharedViewNewsComponent } from '../../theme/layout/admin/navigation/shared-view-news/shared-view-news.component';

/**
 * Visualización de novedades restringida a una subárea concreta.
 * Lee `area` y `subArea` desde la `data` de la ruta; el componente compartido filtra
 * por origen O destino asignado para que cada subárea vea solo lo suyo.
 */
@Component({
  selector: 'app-subarea-view-news',
  standalone: true,
  imports: [SharedViewNewsComponent],
  templateUrl: './subarea-view-news.html'
})
export class SubAreaViewNews {
  private route = inject(ActivatedRoute);
  readonly area: string = this.route.snapshot.data['area'] ?? '';
  readonly subArea: string = this.route.snapshot.data['subArea'] ?? '';
}
