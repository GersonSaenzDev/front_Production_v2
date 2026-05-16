import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-coating-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './coating-news.html',
  styleUrl: './coating-news.scss'
})
export class CoatingNews {}
