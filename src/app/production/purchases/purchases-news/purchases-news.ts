import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-purchases-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './purchases-news.html',
  styleUrl: './purchases-news.scss'
})
export class PurchasesNews {}
