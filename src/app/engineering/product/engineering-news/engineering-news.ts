import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news.component';

@Component({
  selector: 'app-product-engineering-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './engineering-news.html',
  styleUrl: './engineering-news.scss'
})
export class ProductEngineeringNews {}
