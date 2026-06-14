import { Component, inject, OnInit, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { PsicologoService } from '../../../core/services/psicologo.service';
import { QuestionarioService } from '../../../core/services/questionario.service';
import { DesafioService } from '../../../core/services/desafio.service';
import { PacienteService } from '../../../core/services/paciente.service';
import { todayDateString, minBirthDateString } from '../../../core/utils/date.utils';

export interface PacienteRow {
  _id: string;
  user?: { nome?: string; email?: string };
  avgHumor?: string;
  humorBaixo?: boolean;
  semRegistoHumor3Dias?: boolean;
  ultimoRegistoData?: string;
  avgMes?: number;
  monitorizado4Dias?: boolean;
  desafiosPendentes?: number;
}

export type EstadoFiltro = 'todos' | 'atencao' | 'recuperacao';

@Component({
  selector: 'app-psicologo-pacientes',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
  ],
  templateUrl: './pacientes.html',
  styleUrl: './pacientes.css',
})
export class PsicologoPacientesComponent implements OnInit {
  private psiSvc      = inject(PsicologoService);
  private qSvc        = inject(QuestionarioService);
  private desafioSvc  = inject(DesafioService);
  private pacienteSvc = inject(PacienteService);
  private fb          = inject(FormBuilder);

  pacientes = signal<PacienteRow[]>([]);
  loading   = signal(true);
  search    = signal('');
  estadoFiltro = signal<EstadoFiltro>('todos');

  /** Id do paciente cujo menu de ações (⋯) está aberto, ou null se nenhum estiver. */
  menuAbertoId = signal<string | null>(null);

  // ── Criar paciente ───────────────────────────────────────────────────────────
  showModal   = signal(false);
  creating    = signal(false);
  createError = signal<string | null>(null);
  createDone  = signal(false);
  hidePassword = true;

  /** Today's date ('YYYY-MM-DD'); data de nascimento cannot be later than this. */
  readonly maxBirthDate = todayDateString();
  /** Earliest allowed birth date ('YYYY-MM-DD'); age cannot exceed 120 years. */
  readonly minBirthDate = minBirthDateString();

  form = this.fb.group({
    nome:             ['', [Validators.required, Validators.minLength(2)]],
    email:            ['', [Validators.required, Validators.email]],
    password:         ['', [Validators.required, Validators.minLength(6), Validators.pattern(/.*[0-9].*/)]],
    genero:           ['outro', Validators.required],
    data_nascimento:  ['', Validators.required],
    doenca:           ['', Validators.required],
    comorbilidades:   [''],
    exercicioRegular: [''],
    fumador:          [''],
  });

  // ── Inativar paciente (terminar percurso de monitorização) ──────────────────
  inativandoPaciente = signal<PacienteRow | null>(null);
  inativarSaving     = signal(false);
  inativarError      = signal<string | null>(null);

  filtered = computed(() => {
    const s = this.search().toLowerCase();
    const f = this.estadoFiltro();
    return this.pacientes().filter(p => {
      const matchesSearch = !s
        || (p.user?.nome ?? '').toLowerCase().includes(s)
        || (p.user?.email ?? '').toLowerCase().includes(s);
      if (!matchesSearch) return false;

      switch (f) {
        case 'atencao':     return this.estado(p) === 'atencao';
        case 'recuperacao': return this.estado(p) === 'recuperacao';
        default: return true;
      }
    });
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);

    this.desafioSvc.getDesafiosByPsicologo().subscribe({
      next: ds => {
        const desafiosPendentesMap: Record<string, number> = {};
        ds.forEach(d => (d.pacientesNaoCumpriram ?? []).forEach((p: any) => {
          desafiosPendentesMap[p._id] = (desafiosPendentesMap[p._id] ?? 0) + 1;
        }));
        this.loadPacientes(desafiosPendentesMap);
      },
      error: () => this.loadPacientes({}),
    });
  }

  private loadPacientes(desafiosPendentesMap: Record<string, number>): void {
    this.psiSvc.getMyProfile().subscribe({
      next: profile => {
        const raw = (profile?.pacientes ?? []) as PacienteRow[];
        let remaining = raw.length;
        if (!remaining) { this.pacientes.set([]); this.loading.set(false); return; }

        const enriched: PacienteRow[] = raw.map(p => ({ ...p }));
        enriched.forEach((p, i) => {
          this.qSvc.getQuestionariosByPaciente(p._id).subscribe({
            next: qs => {
              const sorted = qs
                .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
              const recent = sorted.slice(0, 7);
              if (recent.length) {
                enriched[i].avgHumor = (recent.reduce((s, q) => s + q.humor, 0) / recent.length).toFixed(1);
              }
              enriched[i].humorBaixo = recent.some(q => q.humor <= 2);

              const lastDate = sorted.length ? new Date(sorted[0].data) : null;
              enriched[i].semRegistoHumor3Dias = !lastDate
                || (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24) >= 3;
              enriched[i].ultimoRegistoData = sorted[0]?.data;

              // Média de humor nos últimos 4 dias e se a monitorização já dura há
              // pelo menos 4 dias completos (usado para "boa recuperação").
              const cutoff4 = new Date(); cutoff4.setDate(cutoff4.getDate() - 4);
              const ultimosDias = sorted.filter(q => new Date(q.data) >= cutoff4);
              enriched[i].avgMes = ultimosDias.length
                ? ultimosDias.reduce((s, q) => s + q.humor, 0) / ultimosDias.length
                : 0;
              const primeiroRegisto = sorted.length ? new Date(sorted[sorted.length - 1].data) : null;
              enriched[i].monitorizado4Dias = !!primeiroRegisto
                && (Date.now() - primeiroRegisto.getTime()) / (1000 * 60 * 60 * 24) >= 4;
              enriched[i].desafiosPendentes = desafiosPendentesMap[p._id] ?? 0;
            },
            complete: () => { remaining--; if (!remaining) { this.pacientes.set(enriched); this.loading.set(false); } },
            error:    () => { remaining--; if (!remaining) { this.pacientes.set(enriched); this.loading.set(false); } },
          });
        });
      },
      error: () => this.loading.set(false),
    });
  }

  humorClass(avg: string): string {
    const v = parseFloat(avg);
    if (v <= 2) return 'humor-pill--low';
    if (v <= 3.5) return 'humor-pill--mid';
    return 'humor-pill--ok';
  }

  /** Formata o humor médio com vírgula decimal (ex.: "4.0" → "4,0"). */
  formatHumor(avg: string): string {
    return avg.replace('.', ',');
  }

  /** Estado geral do paciente: monitorização prioritária, boa recuperação ou ativo/estável.
   *  "Boa recuperação" corresponde aos pacientes com humor positivo (4 ou 5),
   *  sem desafios pendentes e com boas estatísticas durante 4 dias completos de
   *  monitorização — mesma lista usada nas estatísticas do psicólogo. */
  estado(p: PacienteRow): 'atencao' | 'recuperacao' | 'ativo' {
    if (p.humorBaixo || p.semRegistoHumor3Dias) return 'atencao';
    if (p.monitorizado4Dias && (p.avgMes ?? 0) >= 4 && (p.desafiosPendentes ?? 0) === 0) return 'recuperacao';
    return 'ativo';
  }

  estadoLabel(p: PacienteRow): string {
    switch (this.estado(p)) {
      case 'atencao':     return 'Em atenção';
      case 'recuperacao': return 'Boa recuperação';
      default:            return 'Ativo';
    }
  }

  /** Texto descritivo do último registo de humor do paciente. */
  ultimoRegistoTexto(p: PacienteRow): string {
    if (!p.ultimoRegistoData) return 'Sem dados recentes';
    const data = new Date(p.ultimoRegistoData);
    if (this.isHoje(data)) return 'Último registo hoje';

    const dias = Math.floor((Date.now() - data.getTime()) / (1000 * 60 * 60 * 24));
    if (dias === 1) return 'Último registo ontem';
    return `Último registo há ${dias} dias`;
  }

  private isHoje(data: Date): boolean {
    const now = new Date();
    return data.getFullYear() === now.getFullYear()
        && data.getMonth() === now.getMonth()
        && data.getDate() === now.getDate();
  }

  // ── Menu de ações (⋯) ────────────────────────────────────────────────────────
  toggleMenu(id: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuAbertoId.set(this.menuAbertoId() === id ? null : id);
  }

  @HostListener('document:click')
  fecharMenu(): void {
    this.menuAbertoId.set(null);
  }

  // ── Criar paciente ───────────────────────────────────────────────────────────
  openModal(): void {
    this.form.reset({ genero: 'outro', exercicioRegular: '', fumador: '' });
    this.createError.set(null);
    this.createDone.set(false);
    this.showModal.set(true);
  }

  closeModal(): void {
    if (this.creating()) return;
    this.showModal.set(false);
  }

  private toBool(v: string | null | undefined): boolean | null {
    if (v === 'sim') return true;
    if (v === 'nao') return false;
    return null;
  }

  /** Gera uma password aleatória (mín. 8 caracteres, incluindo um número) e
   *  preenche o campo, tornando-a visível para o psicólogo a transmitir. */
  gerarPassword(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!/[0-9]/.test(pwd)) {
      pwd = pwd.slice(0, -1) + Math.floor(Math.random() * 10);
    }
    this.form.patchValue({ password: pwd });
    this.hidePassword = false;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.createError.set('Existem campos inválidos ou em falta. Verifique os campos assinalados.');
      return;
    }

    this.creating.set(true);
    this.createError.set(null);

    const v = this.form.value;
    const comorbilidades = (v.comorbilidades ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    this.pacienteSvc.criarPaciente({
      nome: v.nome!,
      email: v.email!,
      password: v.password!,
      genero: v.genero!,
      data_nascimento: v.data_nascimento!,
      doenca: v.doenca!,
      formulario: {
        historicoMedico: { comorbilidades },
        estiloDeVida: {
          exercicioRegular: this.toBool(v.exercicioRegular),
          fumador: this.toBool(v.fumador),
        },
      },
    }).subscribe({
      next: () => {
        this.creating.set(false);
        this.createDone.set(true);
        this.showModal.set(false);
        this.load();
      },
      error: err => {
        this.creating.set(false);
        this.createError.set(err.error?.error ?? 'Erro ao criar paciente.');
      },
    });
  }

  // ── Inativar paciente (terminar percurso de monitorização) ──────────────────
  confirmInativar(p: PacienteRow): void {
    this.inativarError.set(null);
    this.inativandoPaciente.set(p);
  }

  cancelInativar(): void {
    if (this.inativarSaving()) return;
    this.inativandoPaciente.set(null);
  }

  inativarConfirmed(): void {
    const p = this.inativandoPaciente();
    if (!p) return;

    this.inativarSaving.set(true);
    this.pacienteSvc.terminarMonitorizacao(p._id).subscribe({
      next: () => {
        this.inativarSaving.set(false);
        this.inativandoPaciente.set(null);
        this.pacientes.update(list => list.filter(x => x._id !== p._id));
      },
      error: err => {
        this.inativarSaving.set(false);
        this.inativarError.set(err.error?.error ?? 'Erro ao terminar o percurso de monitorização.');
      },
    });
  }
}
