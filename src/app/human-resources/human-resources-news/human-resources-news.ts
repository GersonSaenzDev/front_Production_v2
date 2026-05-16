import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-human-resources-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './human-resources-news.html',
  styleUrl: './human-resources-news.scss'
})
export class HumanResourcesNews {}
