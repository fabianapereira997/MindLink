import { Component, inject, OnInit, signal, computed, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PsicologoService } from '../../core/services/psicologo.service';
import { QuestionarioService, Questionario } from '../../core/services/questionario.service';
import { DesafioService } from '../../core/services/desafio.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface PacienteStats {
  _id: string;
  user?: { nome?: string };
  avgHumor: string;
  avgRecente: number;
  avgAnterior: number;
  streak: number;
  totalRegistos: number;
  desafiosPendentes: number;
}

@Component({
  selector: 'app-psicologo-estatisticas',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './estatisticas.html',
  styleUrl: './estatisticas.css',
})
export class PsicologoEstatisticasComponent implements OnInit, AfterViewInit {
  @ViewChild('geralChart') chartRef!: ElementRef<HTMLCanvasElement>;

  private psiSvc     = inject(PsicologoService);
  private qSvc       = inject(QuestionarioService);
  private desafioSvc = inject(DesafioService);

  pacientesStats   = signal<PacienteStats[]>([]);
  allData          = signal<{ date: string; avg: number }[]>([]);
  loading          = signal(true);
  private chart: Chart | null = null;
  private viewReady = false;
  private desafiosPendentesMap = signal<Record<string, number>>({});

  pctMelhorando = computed(() => {
    const ps = this.pacientesStats();
    if (!ps.length) return 0;
    return Math.round((ps.filter(p => p.avgRecente > p.avgAnterior).length / ps.length) * 100);
  });

  pctRegredir = computed(() => {
    const ps = this.pacientesStats();
    if (!ps.length) return 0;
    return Math.round((ps.filter(p => p.avgRecente < p.avgAnterior).length / ps.length) * 100);
  });

  pacientesAtencao = computed(() =>
    this.pacientesStats()
      .filter(p => p.avgRecente <= 2.5 && p.desafiosPendentes > 0)
      .sort((a, b) => a.avgRecente - b.avgRecente)
  );

  pacientesAssiduos = computed(() =>
    this.pacientesStats()
      .filter(p => p.streak >= 5 && p.desafiosPendentes === 0)
      .sort((a, b) => b.streak - a.streak)
  );

  totalRegistos = computed(() =>
    this.pacientesStats().reduce((s, p) => s + p.totalRegistos, 0)
  );

  avgGeral = computed(() => {
    const ps = this.pacientesStats().filter(p => p.avgRecente > 0);
    if (!ps.length) return '—';
    return (ps.reduce((s, p) => s + p.avgRecente, 0) / ps.length).toFixed(1);
  });

  ngOnInit(): void {
    this.desafioSvc.getDesafiosByPsicologo().subscribe({
      next: ds => {
        const map: Record<string, number> = {};
        ds.forEach(d => (d.pacientesNaoCumpriram ?? []).forEach((p: any) => {
          map[p._id] = (map[p._id] ?? 0) + 1;
        }));
        this.desafiosPendentesMap.set(map);
      },
    });

    this.psiSvc.getMyProfile().subscribe({
      next: profile => {
        const rawPacientes = (profile?.pacientes ?? []) as any[];
        let remaining = rawPacientes.length;
        if (!remaining) { this.loading.set(false); return; }

        const statsArr: PacienteStats[] = rawPacientes.map(p => ({
          _id: p._id,
          user: p.user,
          avgHumor: '—',
          avgRecente: 0,
          avgAnterior: 0,
          streak: 0,
          totalRegistos: 0,
          desafiosPendentes: 0,
        }));

        const allQs: Questionario[] = [];

        statsArr.forEach((ps, i) => {
          this.qSvc.getQuestionariosByPaciente(ps._id).subscribe({
            next: qs => {
              allQs.push(...qs);
              const sorted = [...qs].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
              const recent = sorted.slice(0, 7);
              const older  = sorted.slice(7, 14);

              statsArr[i].totalRegistos = qs.length;
              statsArr[i].avgRecente = recent.length
                ? recent.reduce((s, q) => s + q.humor, 0) / recent.length
                : 0;
              statsArr[i].avgAnterior = older.length
                ? older.reduce((s, q) => s + q.humor, 0) / older.length
                : statsArr[i].avgRecente;
              statsArr[i].avgHumor = statsArr[i].avgRecente
                ? statsArr[i].avgRecente.toFixed(1)
                : '—';
              statsArr[i].streak = this.calcStreak(sorted);
              statsArr[i].desafiosPendentes = this.desafiosPendentesMap()[ps._id] ?? 0;
            },
            complete: () => {
              remaining--;
              if (remaining === 0) {
                this.pacientesStats.set(statsArr);
                this.buildChartData(allQs);
                this.loading.set(false);
                if (this.viewReady) setTimeout(() => this.renderChart(), 0);
              }
            },
            error: () => {
              remaining--;
              if (remaining === 0) {
                this.pacientesStats.set(statsArr);
                this.loading.set(false);
              }
            },
          });
        });
      },
      error: () => this.loading.set(false),
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (!this.loading() && this.allData().length) setTimeout(() => this.renderChart(), 0);
  }

  private buildChartData(qs: Questionario[]): void {
    const now = new Date();
    const cutoff = new Date(now); cutoff.setDate(now.getDate() - 30);
    const dayMap: Record<string, number[]> = {};
    qs.filter(q => new Date(q.data) >= cutoff).forEach(q => {
      const iso = new Date(q.data).toISOString().slice(0, 10);
      (dayMap[iso] = dayMap[iso] ?? []).push(q.humor);
    });
    const data = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, avg: vals.reduce((s, v) => s + v, 0) / vals.length }));
    this.allData.set(data);
  }

  private calcStreak(sorted: Questionario[]): number {
    let count = 0;
    let day = new Date(); day.setHours(0, 0, 0, 0);
    for (const q of sorted) {
      const qDay = new Date(q.data); qDay.setHours(0, 0, 0, 0);
      if ((day.getTime() - qDay.getTime()) / 86400000 > 1) break;
      count++;
      day = qDay;
    }
    return count;
  }

  private renderChart(): void {
    if (!this.chartRef) return;
    if (this.chart) this.chart.destroy();
    const data = this.allData();

    this.chart = new Chart(this.chartRef.nativeElement, {
      type: 'line',
      data: {
        labels: data.map(d => new Date(d.date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })),
        datasets: [{
          label: 'Humor médio',
          data: data.map(d => d.avg),
          borderColor: '#26874E',
          backgroundColor: 'rgba(38,135,78,0.07)',
          borderWidth: 2.5,
          pointBackgroundColor: '#26874E',
          pointRadius: 4,
          tension: 0.35,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` Média: ${(ctx.parsed.y as number).toFixed(1)}/5` } },
        },
        scales: {
          y: { min: 1, max: 5, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } },
        },
      },
    });
  }
}
