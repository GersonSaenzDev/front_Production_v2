import { Component } from '@angular/core';
import { SharedViewNewsComponent } from '../../../theme/layout/admin/navigation/shared-view-news/shared-view-news.component';

@Component({
  selector: 'app-almacen-view-news',
  standalone: true,
  imports: [SharedViewNewsComponent],
  templateUrl: './view-news.html',
  styleUrl: './view-news.scss'
})
export class AlmacenViewNews {}
