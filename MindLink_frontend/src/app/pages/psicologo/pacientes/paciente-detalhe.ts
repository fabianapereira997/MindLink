import { Component, inject, OnInit, signal, computed, effect, ViewChild, ElementRef, AfterViewInit, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { PsicologoService } from '../../../core/services/psicologo.service';
import { QuestionarioService, Questionario } from '../../../core/services/questionario.service';
import { PacienteService } from '../../../core/services/paciente.service';
import { ChatService } from '../../../core/services/chat.service';
import { Chart, registerables } from 'chart.js';
import { calcularIdade, formatarMesAno } from '../../../core/utils/date.utils';
import { QUESTIONARIO_GRUPOS } from '../../../core/constants/questionario-perguntas';

Chart.register(...registerables);

interface SemanaQuestionarios {
  key: string;
  label: string;
  questionarios: Questionario[];
}

@Component({
  selector: 'app-psicologo-paciente-detalhe',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './paciente-detalhe.html',
  styleUrl: './pacientes.css',
})
export class PsicologoPacienteDetalheComponent implements OnInit, AfterViewInit {
  @ViewChild('moodChart') chartRef!: ElementRef<HTMLCanvasElement>;

  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  private psiSvc      = inject(PsicologoService);
  private qSvc        = inject(QuestionarioService);
  private pacienteSvc = inject(PacienteService);
  private chatSvc     = inject(ChatService);
  private fb          = inject(FormBuilder);

  paciente      = signal<any>(null);
  questionarios = signal<Questionario[]>([]);
  loading       = signal(true);
  private chart: Chart | null = null;
  private viewReady = false;

  // ── Menu de ações (⋯) ──────────────────────────────────────────────────────
  menuAberto = signal(false);

  // ── Inativar paciente ───────────────────────────────────────────────────────
  confirmandoInativar = signal(false);
  inativarSaving = signal(false);
  inativarError = signal<string | null>(null);

  // ── Editar dados clínicos ─────────────────────────────────────────────────
  editandoClinico = signal(false);
  savingClinico = signal(false);
  clinicoError = signal<string | null>(null);

  clinicoForm = this.fb.group({
    doenca: [''],
    comorbilidades: [''],
    exercicioRegular: [''],
    fumador: [''],
  });

  // ── Modal de questionário ─────────────────────────────────────────────────
  selectedQuestionario = signal<Questionario | null>(null);
  readonly QUESTIONARIO_GRUPOS = QUESTIONARIO_GRUPOS;
  private readonly HUMOR_COLORS = ['', '#dc2626', '#f97316', '#eab308', '#73C883', '#26874E'];
  private readonly HUMOR_LABELS = ['', 'Muito mau', 'Mau', 'Razoável', 'Bom', 'Muito bom'];

  // ── Semanas (histórico de questionários agrupado) ──────────────────────────
  semanasAbertas = signal<Set<string>>(new Set());

  constructor() {
    // Garante que o gráfico é (re)desenhado sempre que os dados/canvas ficarem
    // disponíveis, independentemente da ordem em que paciente/questionários carregam.
    effect(() => {
      const pronto = !this.loading() && !!this.paciente() && this.questionarios().length > 0;
      if (pronto) {
        setTimeout(() => this.renderChart(), 0);
      }
    });
  }

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
        const semanas = this.semanas();
        if (semanas.length) this.semanasAbertas.set(new Set([semanas[0].key]));
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

  // ── Género / idade / cabeçalho ───────────────────────────────────────────────
  generoLabel(): string {
    const g = this.paciente()?.user?.genero;
    if (!g) return '—';
    return g.charAt(0).toUpperCase() + g.slice(1);
  }

  idade(): number | null {
    const data = this.paciente()?.user?.data_nascimento;
    return data ? calcularIdade(data) : null;
  }

  pacienteDesdeTexto(): string {
    const createdAt = this.paciente()?.createdAt;
    if (!createdAt) return '';
    return `Paciente desde ${formatarMesAno(createdAt)}`;
  }

  ultimoRegistoTexto(): string {
    const qs = this.questionarios();
    if (!qs.length) return 'Sem registos';
    const data = new Date(qs[0].data);
    if (this.isHoje(data)) return 'Último registo hoje';
    const dias = Math.floor((Date.now() - data.getTime()) / (1000 * 60 * 60 * 24));
    if (dias === 1) return 'Último registo ontem';
    return `Último registo há ${dias} dias`;
  }

  private isHoje(data: Date): boolean {
    const now = new Date();
    return data.getFullYear() === now.getFullYear() && data.getMonth() === now.getMonth() && data.getDate() === now.getDate();
  }

  // ── Menu de ações (⋯) ──────────────────────────────────────────────────────
  toggleMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuAberto.update(v => !v);
  }

  @HostListener('document:click')
  fecharMenu(): void {
    this.menuAberto.set(false);
  }

  abrirChat(): void {
    const p = this.paciente();
    if (p) this.chatSvc.openChatWithPaciente(p._id);
    this.menuAberto.set(false);
  }

  // ── Inativar paciente ───────────────────────────────────────────────────────
  confirmInativar(): void {
    this.inativarError.set(null);
    this.confirmandoInativar.set(true);
    this.menuAberto.set(false);
  }

  cancelInativar(): void {
    if (this.inativarSaving()) return;
    this.confirmandoInativar.set(false);
  }

  inativarConfirmed(): void {
    const p = this.paciente();
    if (!p) return;
    this.inativarSaving.set(true);
    this.pacienteSvc.terminarMonitorizacao(p._id).subscribe({
      next: () => {
        this.inativarSaving.set(false);
        this.confirmandoInativar.set(false);
        this.router.navigate(['/psicologo/pacientes']);
      },
      error: err => {
        this.inativarSaving.set(false);
        this.inativarError.set(err.error?.error ?? 'Erro ao terminar o percurso de monitorização.');
      },
    });
  }

  // ── Editar dados clínicos ─────────────────────────────────────────────────
  startEditClinico(): void {
    const p = this.paciente();
    this.clinicoForm.reset({
      doenca: p?.doenca ?? '',
      comorbilidades: (p?.formulario?.historicoMedico?.comorbilidades ?? []).join(', '),
      exercicioRegular: this.fromBool(p?.formulario?.estiloDeVida?.exercicioRegular),
      fumador: this.fromBool(p?.formulario?.estiloDeVida?.fumador),
    });
    this.clinicoError.set(null);
    this.editandoClinico.set(true);
  }

  cancelEditClinico(): void {
    if (this.savingClinico()) return;
    this.editandoClinico.set(false);
  }

  private fromBool(v: boolean | null | undefined): string {
    if (v === true) return 'sim';
    if (v === false) return 'nao';
    return '';
  }

  private toBool(v: string | null | undefined): boolean | null {
    if (v === 'sim') return true;
    if (v === 'nao') return false;
    return null;
  }

  saveClinico(): void {
    const p = this.paciente();
    if (!p) return;
    this.savingClinico.set(true);
    this.clinicoError.set(null);
    const v = this.clinicoForm.value;
    const comorbilidades = (v.comorbilidades ?? '').split(',').map(s => s.trim()).filter(Boolean);

    this.pacienteSvc.updateDadosClinicos(p._id, {
      doenca: v.doenca ?? '',
      formulario: {
        historicoMedico: { comorbilidades },
        estiloDeVida: {
          exercicioRegular: this.toBool(v.exercicioRegular),
          fumador: this.toBool(v.fumador),
        },
      },
    }).subscribe({
      next: updated => {
        this.paciente.set({ ...p, doenca: updated.doenca, formulario: updated.formulario });
        this.savingClinico.set(false);
        this.editandoClinico.set(false);
      },
      error: err => {
        this.savingClinico.set(false);
        this.clinicoError.set(err.error?.error ?? 'Erro ao atualizar dados clínicos.');
      },
    });
  }

  // ── Histórico de questionários: agrupamento por semana ─────────────────────
  semanas = computed<SemanaQuestionarios[]>(() => {
    const qs = this.questionarios();
    const map = new Map<string, Questionario[]>();
    for (const q of qs) {
      const monday = this.startOfWeek(new Date(q.data));
      const key = monday.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(q);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ key, label: this.semanaLabel(new Date(key)), questionarios: items }));
  });

  private startOfWeek(d: Date): Date {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    const day = date.getDay(); // 0 = domingo .. 6 = sábado
    const diff = day === 0 ? -6 : 1 - day; // semana começa à segunda-feira
    date.setDate(date.getDate() + diff);
    return date;
  }

  private semanaLabel(monday: Date): string {
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const mesmoMes = monday.getMonth() === sunday.getMonth();
    if (mesmoMes) {
      const mesAno = sunday.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
      return `Semana ${monday.getDate()}-${sunday.getDate()} ${mesAno}`;
    }
    const mesInicio = monday.toLocaleDateString('pt-PT', { month: 'long' });
    const mesAnoFim = sunday.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    return `Semana ${monday.getDate()} ${mesInicio} - ${sunday.getDate()} ${mesAnoFim}`;
  }

  toggleSemana(key: string): void {
    this.semanasAbertas.update(set => {
      const novo = new Set(set);
      if (novo.has(key)) novo.delete(key); else novo.add(key);
      return novo;
    });
  }

  semanaAberta(key: string): boolean {
    return this.semanasAbertas().has(key);
  }

  // ── Modal de questionário ─────────────────────────────────────────────────
  humorCor(q: Questionario): string {
    return this.HUMOR_COLORS[q.humor] ?? '';
  }

  humorLabel(q: Questionario): string {
    return this.HUMOR_LABELS[q.humor] ?? '';
  }

  abrirQModal(q: Questionario): void {
    this.selectedQuestionario.set(q);
  }

  fecharQModal(): void {
    this.selectedQuestionario.set(null);
  }

  enviarMensagemQuestionario(): void {
    const q = this.selectedQuestionario();
    const p = this.paciente();
    if (!q || !p) return;
    const dataStr = this.formatDataPtBr(q.data);
    let replyTo = `Questionário ${dataStr}`;
    if (q.notas) replyTo += `\n${q.notas}`;
    this.chatSvc.openChatWithPaciente(p._id, replyTo);
    this.fecharQModal();
  }

  private formatDataPtBr(data: string): string {
    const d = new Date(data);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
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
