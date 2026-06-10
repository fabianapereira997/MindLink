import { Component, inject, OnInit, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { PsicologoService } from '../../../core/services/psicologo.service';
import { QuestionarioService, Questionario } from '../../../core/services/questionario.service';
import { PacienteService } from '../../../core/services/paciente.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-psicologo-paciente-detalhe',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './paciente-detalhe.html',
  styleUrl: './pacientes.css',
})
export class PsicologoPacienteDetalheComponent implements OnInit, AfterViewInit {
  @ViewChild('moodChart') chartRef!: ElementRef<HTMLCanvasElement>;

  private route   = inject(ActivatedRoute);
  private psiSvc  = inject(PsicologoService);
  private qSvc    = inject(QuestionarioService);
  private pacSvc  = inject(PacienteService);

  paciente      = signal<any>(null);
  questionarios = signal<Questionario[]>([]);
  loading       = signal(true);
  exporting     = signal(false);
  exportError   = signal<string | null>(null);
  private chart: Chart | null = null;
  private viewReady = false;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;

    this.psiSvc.getMyProfile().subscribe({
      next: profile => {
        const p = (profile?.pacientes ?? []).find((x: any) => x._id === id) ?? null;
        this.paciente.set(p);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.qSvc.getQuestionariosByPaciente(id).subscribe({
      next: qs => {
        const sorted = [...qs].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
        this.questionarios.set(sorted);
        if (this.viewReady) setTimeout(() => this.renderChart(), 0);
      },
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (!this.loading()) setTimeout(() => this.renderChart(), 0);
  }

  initials(): string {
    const nome = this.paciente()?.user?.nome ?? '';
    return nome.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  }

  avg(): string {
    const qs = this.questionarios().slice(0, 7);
    if (!qs.length) return '—';
    return (qs.reduce((s, q) => s + q.humor, 0) / qs.length).toFixed(1);
  }

  avgColor(): string {
    const v = parseFloat(this.avg());
    if (isNaN(v)) return 'var(--color-text-muted)';
    if (v <= 2) return '#dc2626';
    if (v <= 3.5) return '#ca8a04';
    return 'var(--color-primary)';
  }

  streak(): number {
    const qs = [...this.questionarios()].reverse();
    let count = 0;
    let day = new Date(); day.setHours(0, 0, 0, 0);
    for (const q of qs) {
      const qDay = new Date(q.data); qDay.setHours(0, 0, 0, 0);
      if ((day.getTime() - qDay.getTime()) / 86400000 > 1) break;
      count++;
      day = qDay;
    }
    return count;
  }

  sintomasText(sintomas: string[] | string | undefined): string {
    if (!sintomas) return '';
    return Array.isArray(sintomas) ? sintomas.join(', ') : sintomas;
  }

  hasSintomas(sintomas: string[] | string | undefined): boolean {
    if (!sintomas) return false;
    return Array.isArray(sintomas) ? sintomas.length > 0 : sintomas.trim().length > 0;
  }

  humorPillClass(humor: number): string {
    if (humor <= 2) return 'humor-pill--low';
    if (humor <= 3) return 'humor-pill--mid';
    return 'humor-pill--ok';
  }

  // ── Exportar dados (XML) ─────────────────────────────────────────────────────
  exportarPaciente(): void {
    const p = this.paciente();
    if (!p) return;

    this.exportError.set(null);
    this.exporting.set(true);
    this.pacSvc.exportarPaciente(p._id).subscribe({
      next: blob => {
        this.exporting.set(false);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `paciente-${p._id}.xml`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: err => {
        this.exporting.set(false);
        this.exportError.set(err.error?.error ?? 'Erro ao exportar os dados do paciente.');
      },
    });
  }

  private renderChart(): void {
    if (!this.chartRef) return;
    if (this.chart) this.chart.destroy();
    const qs = [...this.questionarios()].reverse();

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
          y: { min: 1, max: 5, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } },
        },
      },
    });
  }
}
