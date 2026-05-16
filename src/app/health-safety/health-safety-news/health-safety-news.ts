import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-health-safety-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './health-safety-news.html',
  styleUrl: './health-safety-news.scss'
})
export class HealthSafetyNews {}
