import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { PsicologoService } from '../../../core/services/psicologo.service';
import { QuestionarioService } from '../../../core/services/questionario.service';
import { PacienteService } from '../../../core/services/paciente.service';
import { todayDateString } from '../../../core/utils/date.utils';

export interface PacienteRow {
  _id: string;
  user?: { nome?: string; email?: string };
  avgHumor?: string;
}

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
  private pacienteSvc = inject(PacienteService);
  private fb          = inject(FormBuilder);

  pacientes = signal<PacienteRow[]>([]);
  loading   = signal(true);
  search    = signal('');

  // ── Criar paciente ───────────────────────────────────────────────────────────
  showModal   = signal(false);
  creating    = signal(false);
  createError = signal<string | null>(null);
  createDone  = signal(false);
  hidePassword = true;

  /** Today's date ('YYYY-MM-DD'); data de nascimento cannot be later than this. */
  readonly maxBirthDate = todayDateString();

  form = this.fb.group({
    nome:             ['', [Validators.required, Validators.minLength(2)]],
    email:            ['', [Validators.required, Validators.email]],
    password:         ['', [Validators.required, Validators.minLength(6)]],
    genero:           ['outro', Validators.required],
    data_nascimento:  ['', Validators.required],
    doenca:           ['', Validators.required],
    comorbilidades:   [''],
    exercicioRegular: [''],
    fumador:          [''],
  });

  // ── Eliminar paciente ────────────────────────────────────────────────────────
  deletingPaciente = signal<PacienteRow | null>(null);
  deleteSaving     = signal(false);
  deleteError      = signal<string | null>(null);

  // ── Exportar lista (XML) ─────────────────────────────────────────────────────
  exportingLista = signal(false);
  exportError    = signal<string | null>(null);

  filtered = computed(() => {
    const s = this.search().toLowerCase();
    if (!s) return this.pacientes();
    return this.pacientes().filter(p =>
      (p.user?.nome ?? '').toLowerCase().includes(s) ||
      (p.user?.email ?? '').toLowerCase().includes(s)
    );
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.psiSvc.getMyProfile().subscribe({
      next: profile => {
        const raw = (profile?.pacientes ?? []) as PacienteRow[];
        let remaining = raw.length;
        if (!remaining) { this.pacientes.set([]); this.loading.set(false); return; }

        const enriched: PacienteRow[] = raw.map(p => ({ ...p }));
        enriched.forEach((p, i) => {
          this.qSvc.getQuestionariosByPaciente(p._id).subscribe({
            next: qs => {
              const recent = qs
                .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
                .slice(0, 7);
              if (recent.length) {
                enriched[i].avgHumor = (recent.reduce((s, q) => s + q.humor, 0) / recent.length).toFixed(1);
              }
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

  submit(): void {
    if (this.form.invalid) return;

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

  // ── Eliminar paciente ────────────────────────────────────────────────────────
  confirmDelete(p: PacienteRow): void {
    this.deleteError.set(null);
    this.deletingPaciente.set(p);
  }

  cancelDelete(): void {
    if (this.deleteSaving()) return;
    this.deletingPaciente.set(null);
  }

  deleteConfirmed(): void {
    const p = this.deletingPaciente();
    if (!p) return;

    this.deleteSaving.set(true);
    this.pacienteSvc.eliminarPaciente(p._id).subscribe({
      next: () => {
        this.deleteSaving.set(false);
        this.deletingPaciente.set(null);
        this.load();
      },
      error: err => {
        this.deleteSaving.set(false);
        this.deleteError.set(err.error?.error ?? 'Erro ao eliminar paciente.');
      },
    });
  }

  // ── Exportar lista (XML) ─────────────────────────────────────────────────────
  exportarLista(): void {
    this.exportError.set(null);
    this.exportingLista.set(true);
    this.pacienteSvc.exportarListaPacientes().subscribe({
      next: blob => {
        this.exportingLista.set(false);
        this.downloadBlob(blob, 'pacientes.xml');
      },
      error: err => {
        this.exportingLista.set(false);
        this.exportError.set(err.error?.error ?? 'Erro ao exportar a lista de pacientes.');
      },
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
