import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-laboratory-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './laboratory-news.html',
  styleUrl: './laboratory-news.scss'
})
export class LaboratoryNews {}
