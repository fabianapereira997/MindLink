import { Component, inject, OnInit, signal, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AuthService } from '../../../core/auth/auth.service';
import { QuestionarioService, Questionario } from '../../../core/services/questionario.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

type Period = 'semanal' | 'mensal' | 'global';

@Component({
  selector: 'app-paciente-dashboard',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class PacienteDashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('moodChart') chartRef!: ElementRef<HTMLCanvasElement>;

  auth           = inject(AuthService);
  private qSvc   = inject(QuestionarioService);

  allQuestionarios  = signal<Questionario[]>([]);
  loading           = signal(true);
  period            = signal<Period>('semanal');
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
        if (this.viewReady) setTimeout(() => this.renderChart(), 0);
      },
      error: () => this.loading.set(false),
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (!this.loading()) setTimeout(() => this.renderChart(), 0);
  }

  setPeriod(p: Period): void {
    this.period.set(p);
    setTimeout(() => this.renderChart(), 0);
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

  // Color ramp: 1=red, 2=orange, 3=amber, 4=light-green, 5=dark-green
  private readonly HUMOR_COLORS = ['', '#dc2626', '#f97316', '#eab308', '#73C883', '#26874E'];

  /** Cor associada ao humor médio do período, para destacar o bloco de estatística. */
  avgColor(): string {
    const qs = this.filtered();
    if (!qs.length) return '';
    const avgNum = qs.reduce((s, q) => s + q.humor, 0) / qs.length;
    const rounded = Math.min(5, Math.max(1, Math.round(avgNum)));
    return this.HUMOR_COLORS[rounded];
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
