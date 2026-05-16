import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-almacen-logistics-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './logistics-news.html',
  styleUrl: './logistics-news.scss'
})
export class AlmacenLogisticsNews {}
