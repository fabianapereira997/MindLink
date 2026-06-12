import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  ReactiveFormsModule, FormBuilder, Validators,
  AbstractControl, ValidationErrors,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/auth/auth.service';
import { PacienteService, PacienteProfile } from '../../../core/services/paciente.service';
import { todayDateString } from '../../../core/utils/date.utils';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const pw  = control.get('newPassword')?.value;
  const pw2 = control.get('confirmPassword')?.value;
  if (!pw && !pw2) return null;
  return pw && pw2 && pw === pw2 ? null : { mismatch: true };
}

@Component({
  selector: 'app-paciente-perfil',
  standalone: true,
  imports: [
    CommonModule, DatePipe, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule,
  ],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class PacientePerfilComponent implements OnInit {
  auth    = inject(AuthService);
  private pacSvc = inject(PacienteService);
  private fb     = inject(FormBuilder);

  profile = signal<PacienteProfile | null>(null);
  loading = signal(true);
  editing = signal(false);
  saving  = signal(false);
  error   = signal<string | null>(null);
  success = signal(false);
  hideNew     = true;
  hideConfirm = true;

  /** Today's date ('YYYY-MM-DD'); data de nascimento cannot be later than this. */
  readonly maxBirthDate = todayDateString();

  form = this.fb.group({
    nome:             ['', Validators.required],
    email:            ['', [Validators.required, Validators.email]],
    genero:           ['', Validators.required],
    data_nascimento:  ['', Validators.required],
    exercicioRegular: [''],
    fumador:          [''],
    newPassword:      [''],
    confirmPassword:  [''],
  }, { validators: passwordsMatch });

  ngOnInit(): void {
    this.pacSvc.getMyProfile().subscribe({
      next: profiles => {
        this.profile.set(profiles[0] ?? null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  initials(): string {
    const nome = this.auth.user()?.nome ?? '';
    return nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  startEditing(): void {
    const user = this.auth.user();
    const estilo = this.profile()?.formulario?.estiloDeVida;
    this.form.reset({
      nome:             user?.nome ?? '',
      email:            user?.email ?? '',
      genero:           user?.genero ?? '',
      data_nascimento:  user?.data_nascimento ? user.data_nascimento.substring(0, 10) : '',
      exercicioRegular: this.fromBool(estilo?.exercicioRegular),
      fumador:          this.fromBool(estilo?.fumador),
      newPassword:      '',
      confirmPassword:  '',
    });
    this.error.set(null);
    this.success.set(false);
    this.editing.set(true);
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

  cancelEditing(): void {
    this.editing.set(false);
    this.error.set(null);
  }

  submit(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);

    const v = this.form.value;
    const payload: Record<string, unknown> = {
      nome: v.nome,
      email: v.email,
      genero: v.genero,
      data_nascimento: v.data_nascimento,
    };
    if (v.newPassword) {
      payload['password'] = v.newPassword;
    }

    const estiloDeVida = {
      exercicioRegular: this.toBool(v.exercicioRegular),
      fumador: this.toBool(v.fumador),
    };
    const profile = this.profile();

    this.auth.updateUser(payload).subscribe({
      next: () => {
        if (!profile) {
          this.saving.set(false);
          this.editing.set(false);
          this.success.set(true);
          return;
        }
        this.pacSvc.updateEstiloVida(profile._id, estiloDeVida).subscribe({
          next: updated => {
            this.profile.set(updated);
            this.saving.set(false);
            this.editing.set(false);
            this.success.set(true);
          },
          error: err => {
            this.saving.set(false);
            this.error.set(err.error?.error ?? 'Erro ao atualizar estilo de vida.');
          },
        });
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err.error?.error ?? 'Erro ao atualizar perfil.');
      },
    });
  }
}
