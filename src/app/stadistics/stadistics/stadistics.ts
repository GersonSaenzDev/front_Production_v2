// src/app/stadistics/stadistics/stadistics.ts
import { Component } from '@angular/core';
import { StadisticsNews } from '../news/news';

@Component({
  selector: 'app-stadistics',
  standalone: true,
  imports: [StadisticsNews],
  templateUrl: './stadistics.html',
  styleUrl: './stadistics.scss'
})
export class Stadistics {}
