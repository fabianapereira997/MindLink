import { Component, inject, OnInit, signal, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/auth/auth.service';
import { PacienteService } from '../../../core/services/paciente.service';
import { QuestionarioService, Questionario } from '../../../core/services/questionario.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

type Period = 'semanal' | 'mensal' | 'global';

@Component({
  selector: 'app-paciente-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class PacienteDashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('moodChart') chartRef!: ElementRef<HTMLCanvasElement>;

  auth      = inject(AuthService);
  private pacSvc = inject(PacienteService);
  private qSvc   = inject(QuestionarioService);

  allQuestionarios = signal<Questionario[]>([]);
  loading  = signal(true);
  period   = signal<Period>('semanal');
  private chart: Chart | null = null;
  private viewReady = false;

  periods: { key: Period; label: string }[] = [
    { key: 'semanal', label: 'Esta semana' },
    { key: 'mensal',  label: 'Este mês' },
    { key: 'global',  label: 'Todo o tempo' },
  ];

  ngOnInit(): void {
    this.qSvc.getMyQuestionarios().subscribe({
      next: qs => {
        const sorted = [...qs].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
        this.allQuestionarios.set(sorted);
        this.loading.set(false);
        if (this.viewReady) this.renderChart();
      },
      error: () => this.loading.set(false),
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (!this.loading()) this.renderChart();
  }

  setPeriod(p: Period): void {
    this.period.set(p);
    this.renderChart();
  }

  filtered(): Questionario[] {
    const all = this.allQuestionarios();
    const now = new Date();
    if (this.period() === 'semanal') {
      const cutoff = new Date(now); cutoff.setDate(now.getDate() - 7);
      return all.filter(q => new Date(q.data) >= cutoff);
    }
    if (this.period() === 'mensal') {
      const cutoff = new Date(now); cutoff.setDate(now.getDate() - 30);
      return all.filter(q => new Date(q.data) >= cutoff);
    }
    return all;
  }

  avg(): string {
    const qs = this.filtered();
    if (!qs.length) return '—';
    return (qs.reduce((s, q) => s + q.humor, 0) / qs.length).toFixed(1);
  }

  streak(): number {
    const qs = [...this.allQuestionarios()].reverse();
    let count = 0;
    let day = new Date(); day.setHours(0,0,0,0);
    for (const q of qs) {
      const qDay = new Date(q.data); qDay.setHours(0,0,0,0);
      if ((day.getTime() - qDay.getTime()) / 86400000 > 1) break;
      count++;
      day = qDay;
    }
    return count;
  }

  private renderChart(): void {
    if (!this.chartRef) return;
    if (this.chart) this.chart.destroy();
    const qs = this.filtered();

    this.chart = new Chart(this.chartRef.nativeElement, {
      type: 'line',
      data: {
        labels: qs.map(q => new Date(q.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })),
        datasets: [{
          label: 'Humor',
          data: qs.map(q => q.humor),
          borderColor: '#26874E',
          backgroundColor: 'rgba(38,135,78,0.07)',
          borderWidth: 2.5,
          pointBackgroundColor: '#26874E',
          pointRadius: 5,
          tension: 0.35,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` Humor: ${ctx.parsed.y}/5` } },
        },
        scales: {
          y: {
            min: 1, max: 5,
            ticks: { stepSize: 1, font: { family: 'Inter' } },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
          x: {
            ticks: { font: { family: 'Inter' } },
            grid: { display: false },
          },
        },
      },
    });
  }
}
