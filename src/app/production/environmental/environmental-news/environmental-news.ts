import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-environmental-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './environmental-news.html',
  styleUrl: './environmental-news.scss'
})
export class EnvironmentalNews {}
