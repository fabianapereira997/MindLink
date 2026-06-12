import { Component, inject, OnInit, signal, computed, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PsicologoService } from '../../../core/services/psicologo.service';
import { QuestionarioService, Questionario } from '../../../core/services/questionario.service';
import { DesafioService } from '../../../core/services/desafio.service';
import { PacienteService } from '../../../core/services/paciente.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface PacienteStats {
  _id: string;
  user?: { nome?: string };
  avgHumor: string;
  avgRecente: number;
  avgAnterior: number;
  avgMes: number;
  streak: number;
  totalRegistos: number;
  desafiosPendentes: number;
  humorBaixo: boolean;
  semRegistoHumor3Dias: boolean;
  monitorizadoUmMes: boolean;
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
  private pacSvc     = inject(PacienteService);

  pacientesStats   = signal<PacienteStats[]>([]);
  allData          = signal<{ date: string; avg: number }[]>([]);
  loading          = signal(true);
  selectedPacienteId = signal<string>('geral');
  /** Id do paciente cujo percurso de monitorização está a ser terminado. */
  terminandoId     = signal<string | null>(null);
  terminarError    = signal<string | null>(null);
  private chart: Chart | null = null;
  private viewReady = false;
  private desafiosPendentesMap = signal<Record<string, number>>({});
  private desafiosAtrasoMap = signal<Record<string, number>>({});
  private allQs: Questionario[] = [];
  private qsByPaciente: Record<string, Questionario[]> = {};

  chartTitle = computed(() => {
    const sel = this.selectedPacienteId();
    if (sel === 'geral') return 'Evolução do humor geral (últimos 30 dias)';
    const p = this.pacientesStats().find(p => p._id === sel);
    return `Evolução do humor — ${p?.user?.nome ?? 'Paciente'} (últimos 30 dias)`;
  });

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

  pacientesAtencao = computed(() => {
    const atrasoMap = this.desafiosAtrasoMap();
    return this.pacientesStats()
      .filter(p => p.humorBaixo || p.semRegistoHumor3Dias || (atrasoMap[p._id] ?? 0) >= 3)
      .sort((a, b) => a.avgRecente - b.avgRecente);
  });

  /** Pacientes com humor positivo (4 ou 5) e bom desempenho durante um mês
   *  completo de monitorização, sem desafios pendentes. */
  pacientesRecuperados = computed(() =>
    this.pacientesStats()
      .filter(p => p.monitorizadoUmMes && p.avgMes >= 4 && p.desafiosPendentes === 0)
      .sort((a, b) => b.avgMes - a.avgMes)
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
        const atrasoMap: Record<string, number> = {};
        ds.forEach(d => (d.pacientesNaoCumpriram ?? []).forEach((p: any) => {
          map[p._id] = (map[p._id] ?? 0) + 1;
          const dias = this.calcDiasAtraso(d.data_fim ?? d.createdAt);
          atrasoMap[p._id] = Math.max(atrasoMap[p._id] ?? 0, dias);
        }));
        this.desafiosPendentesMap.set(map);
        this.desafiosAtrasoMap.set(atrasoMap);
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
          avgMes: 0,
          streak: 0,
          totalRegistos: 0,
          desafiosPendentes: 0,
          humorBaixo: false,
          semRegistoHumor3Dias: false,
          monitorizadoUmMes: false,
        }));

        const allQs: Questionario[] = [];

        statsArr.forEach((ps, i) => {
          this.qSvc.getQuestionariosByPaciente(ps._id).subscribe({
            next: qs => {
              allQs.push(...qs);
              this.qsByPaciente[ps._id] = qs;
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
              statsArr[i].humorBaixo = recent.some(q => q.humor <= 2);
              const lastDate = sorted.length ? new Date(sorted[0].data) : null;
              statsArr[i].semRegistoHumor3Dias = !lastDate
                || (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24) >= 3;
              statsArr[i].streak = this.calcStreak(sorted);
              statsArr[i].desafiosPendentes = this.desafiosPendentesMap()[ps._id] ?? 0;

              // Média de humor no último mês e se a monitorização já dura há
              // pelo menos um mês completo (usado para "boa recuperação").
              const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30);
              const ultimoMes = sorted.filter(q => new Date(q.data) >= cutoff30);
              statsArr[i].avgMes = ultimoMes.length
                ? ultimoMes.reduce((s, q) => s + q.humor, 0) / ultimoMes.length
                : 0;
              const primeiroRegisto = sorted.length ? new Date(sorted[sorted.length - 1].data) : null;
              statsArr[i].monitorizadoUmMes = !!primeiroRegisto
                && (Date.now() - primeiroRegisto.getTime()) / (1000 * 60 * 60 * 24) >= 30;
            },
            complete: () => {
              remaining--;
              if (remaining === 0) {
                this.pacientesStats.set(statsArr);
                this.allQs = allQs;
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

  /** Termina o percurso de monitorização do paciente, tornando-o inativo:
   *  deixa de aparecer ao psicólogo (agenda, dados principais, etc.), ficando
   *  visível apenas na página do administrador. */
  terminarMonitorizacao(p: PacienteStats): void {
    if (!confirm(`Terminar o percurso de monitorização de ${p.user?.nome ?? 'este paciente'}? O paciente deixará de aparecer nas suas listas.`)) {
      return;
    }
    this.terminarError.set(null);
    this.terminandoId.set(p._id);
    this.pacSvc.terminarMonitorizacao(p._id).subscribe({
      next: () => {
        this.pacientesStats.update(list => list.filter(s => s._id !== p._id));
        this.terminandoId.set(null);
        if (this.selectedPacienteId() === p._id) {
          this.onPacienteChange('geral');
        }
      },
      error: err => {
        this.terminandoId.set(null);
        this.terminarError.set(err.error?.error ?? 'Erro ao terminar o percurso de monitorização.');
      },
    });
  }

  onPacienteChange(value: string): void {
    this.selectedPacienteId.set(value);
    const qs = value === 'geral' ? this.allQs : (this.qsByPaciente[value] ?? []);
    this.buildChartData(qs);
    if (this.viewReady) setTimeout(() => this.renderChart(), 0);
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

  private calcDiasAtraso(dataFim?: string): number {
    if (!dataFim) return 0;
    const fim = new Date(dataFim);
    fim.setHours(23, 59, 59, 999);
    const now = new Date();
    if (now <= fim) return 0;
    return Math.floor((now.getTime() - fim.getTime()) / (1000 * 60 * 60 * 24));
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
