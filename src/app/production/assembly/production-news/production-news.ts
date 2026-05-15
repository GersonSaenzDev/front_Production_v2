// app/production/assembly/production-news/production-news.ts
import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news.component';

@Component({
  selector: 'app-production-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './production-news.html',
  styleUrl: './production-news.scss'
})
export class ProductionNews {}
