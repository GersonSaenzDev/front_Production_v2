import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-customer-service-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './customer-service-news.html',
  styleUrl: './customer-service-news.scss'
})
export class CustomerServiceNews {}
