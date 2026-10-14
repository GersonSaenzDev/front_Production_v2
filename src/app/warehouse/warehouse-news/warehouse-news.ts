import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../theme/layout/admin/navigation/shared-news/shared-news.component';

// Novedades Bodega: formulario global de novedades (mismo de las demás áreas), con Bodega
// como área de origen. Distinto de "Registro Novedades" (production/wineryNews), que es la
// novedad por referencia de producto.
@Component({
  selector: 'app-warehouse-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './warehouse-news.html'
})
export class WarehouseNews {}
