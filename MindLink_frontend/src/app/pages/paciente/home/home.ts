import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../../core/auth/auth.service';
import { PacienteService, PacienteProfile } from '../../../core/services/paciente.service';
import { QuestionarioService } from '../../../core/services/questionario.service';
import { ConsultaService, Consulta } from '../../../core/services/consulta.service';
import { DesafioService, Desafio } from '../../../core/services/desafio.service';

@Component({
  selector: 'app-paciente-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    DatePipe,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class PacienteHomeComponent implements OnInit {
  auth             = inject(AuthService);
  private fb         = inject(FormBuilder);
  private pacSvc     = inject(PacienteService);
  private qSvc       = inject(QuestionarioService);
  private consultaSvc = inject(ConsultaService);
  private desafioSvc  = inject(DesafioService);

  profile        = signal<PacienteProfile | null>(null);
  consultas      = signal<Consulta[]>([]);
  allDesafios    = signal<Desafio[]>([]);
  loading        = signal(true);
  profileError   = signal<string | null>(null);
  consultaError  = signal<string | null>(null);
  desafioError   = signal<string | null>(null);
  showForm       = signal(false);
  submitError    = signal<string | null>(null);
  submitDone     = signal(false);
  todayDone      = signal(false);

  checkInForm = this.fb.group({
    humor:    [null as number | null, [Validators.required, Validators.min(1), Validators.max(5)]],
    sintomas: [''],
    notas:    [''],
  });

  humorLabels: Record<number, string> = {
    1: '1 — Muito mau',
    2: '2 — Mau',
    3: '3 — Razoável',
    4: '4 — Bom',
    5: '5 — Muito bom',
  };

  // Only challenges whose period hasn't ended yet (data_fim >= today)
  private withinPeriod(d: Desafio): boolean {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(d.data_fim) >= today;
  }

  // Pending challenges (within period)
  pendentes    = computed(() => this.allDesafios().filter(d => d.estado === 'pendente'  && this.withinPeriod(d)));
  // Completed challenges (still within their period — not yet expired)
  concluidos   = computed(() => this.allDesafios().filter(d => d.estado === 'concluido' && this.withinPeriod(d)));

  pendentes_diario   = computed(() => this.pendentes().filter(d => d.tipo === 'diario'));
  pendentes_semanal  = computed(() => this.pendentes().filter(d => d.tipo === 'semanal'));
  concluidos_diario  = computed(() => this.concluidos().filter(d => d.tipo === 'diario'));
  concluidos_semanal = computed(() => this.concluidos().filter(d => d.tipo === 'semanal'));

  hasAny = computed(() =>
    this.pendentes().length > 0 || this.concluidos().length > 0
  );

  ngOnInit(): void {
    this.pacSvc.getMyProfile().subscribe({
      next: profiles => {
        this.loading.set(false);
        if (!profiles.length) {
          this.profileError.set('Perfil de paciente não encontrado. Contacte o seu psicólogo.');
          return;
        }
        const p = profiles[0];
        this.profile.set(p);
        this.loadSubData(p._id);
      },
      error: err => {
        this.loading.set(false);
        this.profileError.set(err.error?.error ?? `Erro ${err.status ?? ''}: não foi possível carregar o perfil.`);
      },
    });

    this.qSvc.getMyQuestionarios().subscribe({
      next: qs => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        this.todayDone.set(qs.some(q => {
          const d = new Date(q.data); d.setHours(0, 0, 0, 0);
          return d.getTime() === today.getTime();
        }));
      },
      error: () => {},
    });
  }

  private loadSubData(pacienteId: string): void {
    this.consultaSvc.getConsultasForPaciente(pacienteId).subscribe({
      next: cs => {
        const agendadas = cs
          .filter(c => c.estado === 'agendada')
          .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
          .slice(0, 3);
        this.consultas.set(agendadas);
      },
      error: err => {
        this.consultaError.set(err.error?.error ?? `Erro ${err.status ?? ''} ao carregar consultas.`);
      },
    });

    this.desafioSvc.getDesafiosForPaciente(pacienteId).subscribe({
      next: ds => this.allDesafios.set(ds),
      error: err => {
        this.desafioError.set(err.error?.error ?? `Erro ${err.status ?? ''} ao carregar desafios.`);
      },
    });
  }

  marcarConcluido(d: Desafio): void {
    this.desafioSvc.marcarConcluido(d._id).subscribe({
      next: updated => {
        this.allDesafios.update(list =>
          list.map(x => x._id === updated._id ? updated : x)
        );
      },
      error: err => console.error('marcarConcluido error:', err),
    });
  }

  submitCheckIn(): void {
    if (this.checkInForm.invalid) return;
    this.submitError.set(null);
    const { humor, sintomas, notas } = this.checkInForm.value;
    this.qSvc.create({
      data: new Date().toISOString(),
      humor: humor!,
      sintomas: sintomas ?? undefined,
      notas: notas ?? undefined,
    }).subscribe({
      next: () => {
        this.checkInForm.reset();
        this.showForm.set(false);
        this.submitDone.set(true);
        this.todayDone.set(true);
        setTimeout(() => this.submitDone.set(false), 4000);
      },
      error: err => this.submitError.set(err.error?.error ?? 'Erro ao submeter.'),
    });
  }
}
