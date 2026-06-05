import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent {
  userName = 'Tomás';

  stats = [
    { label: 'Current streak', value: '7 days', icon: '🔥' },
    { label: 'Avg. mood this week', value: '7.2 / 10', icon: '😊' },
    { label: 'Check-ins this month', value: '18', icon: '📋' },
    { label: 'Mood trend', value: '+0.8', icon: '📈' },
  ];

  recentEntries = [
    { date: 'Today', mood: 8, note: 'Had a productive morning and went for a walk.' },
    { date: 'Yesterday', mood: 6, note: 'Felt a bit tired. Skipped the gym.' },
    { date: '2 days ago', mood: 7, note: 'Good meeting with the team.' },
    { date: '3 days ago', mood: 9, note: 'Best day this week — clear head, great focus.' },
  ];

  getMoodColor(mood: number): string {
    if (mood >= 8) return '#26874E';
    if (mood >= 6) return '#4DA768';
    if (mood >= 4) return '#73C883';
    return '#99E89D';
  }
}
