import { Component } from '@angular/core';
import { SharedViewNewsComponent } from '../../theme/layout/admin/navigation/shared-view-news/shared-view-news.component';

// Visualizador de Novedades Bodega: visor global de novedades filtrado por el área Bodega.
// Distinto de "Ver Novedades" (inventories/checkNews), que muestra las novedades por producto.
@Component({
  selector: 'app-warehouse-view-news',
  standalone: true,
  imports: [SharedViewNewsComponent],
  templateUrl: './warehouse-view-news.html'
})
export class WarehouseViewNews {}
