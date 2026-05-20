import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-oxyplast-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './oxyplast-news.html',
  styleUrl: './oxyplast-news.scss'
})
export class OxyplastNews {}
