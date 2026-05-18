import { Component } from '@angular/core';
import { SharedViewNewsComponent } from '../../theme/layout/admin/navigation/shared-view-news/shared-view-news.component';

@Component({
  selector: 'app-human-resources-view-news',
  standalone: true,
  imports: [SharedViewNewsComponent],
  templateUrl: './view-news.html',
  styleUrl: './view-news.scss'
})
export class ViewNews {}
