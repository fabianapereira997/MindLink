import { Component, inject, OnInit, signal } from '@angular/core';
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
  auth        = inject(AuthService);
  private fb         = inject(FormBuilder);
  private pacSvc     = inject(PacienteService);
  private qSvc       = inject(QuestionarioService);
  private consultaSvc = inject(ConsultaService);
  private desafioSvc  = inject(DesafioService);

  profile     = signal<PacienteProfile | null>(null);
  consultas   = signal<Consulta[]>([]);
  desafios    = signal<Desafio[]>([]);
  loading     = signal(true);
  showForm    = signal(false);
  submitError = signal<string | null>(null);
  submitDone  = signal(false);
  todayDone   = signal(false);

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

  ngOnInit(): void {
    this.pacSvc.getMyProfile().subscribe({
      next: profiles => {
        if (profiles.length) {
          const p = profiles[0];
          this.profile.set(p);
          this.loadData(p._id);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    // Check if today already has a check-in
    this.qSvc.getMyQuestionarios().subscribe(qs => {
      const today = new Date(); today.setHours(0,0,0,0);
      this.todayDone.set(qs.some(q => {
        const d = new Date(q.data); d.setHours(0,0,0,0);
        return d.getTime() === today.getTime();
      }));
    });
  }

  private loadData(pacienteId: string): void {
    this.consultaSvc.getConsultasForPaciente(pacienteId).subscribe(cs => {
      const upcoming = cs
        .filter(c => c.estado === 'agendada' && new Date(c.data) >= new Date())
        .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
        .slice(0, 3);
      this.consultas.set(upcoming);
    });

    this.desafioSvc.getDesafiosForPaciente(pacienteId).subscribe(ds => {
      const active = ds.filter(d =>
        d.estado === 'pendente' &&
        new Date(d.data_fim) >= new Date()
      );
      this.desafios.set(active);
    });
  }

  desafiosDiarios(): Desafio[] {
    return this.desafios().filter(d => d.tipo === 'diario');
  }

  desafiosSemanais(): Desafio[] {
    return this.desafios().filter(d => d.tipo === 'semanal');
  }

  marcarConcluido(d: Desafio): void {
    this.desafioSvc.marcarConcluido(d._id).subscribe(() => {
      this.desafios.set(this.desafios().filter(x => x._id !== d._id));
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
