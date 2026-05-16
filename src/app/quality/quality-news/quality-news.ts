import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-quality-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './quality-news.html',
  styleUrl: './quality-news.scss'
})
export class QualityNews {}
