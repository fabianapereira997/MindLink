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
import { PsicologoService, PsicologoProfile } from '../../../core/services/psicologo.service';
import { todayDateString } from '../../../core/utils/date.utils';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const pw  = control.get('newPassword')?.value;
  const pw2 = control.get('confirmPassword')?.value;
  if (!pw && !pw2) return null;
  return pw && pw2 && pw === pw2 ? null : { mismatch: true };
}

@Component({
  selector: 'app-psicologo-perfil',
  standalone: true,
  imports: [
    CommonModule, DatePipe, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule,
  ],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class PsicologoPerfilComponent implements OnInit {
  auth    = inject(AuthService);
  private psiSvc = inject(PsicologoService);
  private fb     = inject(FormBuilder);

  profile  = signal<PsicologoProfile | null>(null);
  loading  = signal(true);
  editing  = signal(false);
  saving   = signal(false);
  error    = signal<string | null>(null);
  success  = signal(false);
  hideNew     = true;
  hideConfirm = true;

  /** Today's date ('YYYY-MM-DD'); data de nascimento cannot be later than this. */
  readonly maxBirthDate = todayDateString();

  form = this.fb.group({
    nome:            ['', Validators.required],
    email:           ['', [Validators.required, Validators.email]],
    genero:          ['', Validators.required],
    data_nascimento: ['', Validators.required],
    especialidade:   ['', Validators.required],
    newPassword:     [''],
    confirmPassword: [''],
  }, { validators: passwordsMatch });

  ngOnInit(): void {
    this.psiSvc.getMyProfile().subscribe({
      next: profile => {
        this.profile.set(profile);
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
    const profile = this.profile();
    this.form.reset({
      nome:            user?.nome ?? '',
      email:           user?.email ?? '',
      genero:          user?.genero ?? '',
      data_nascimento: user?.data_nascimento ? user.data_nascimento.substring(0, 10) : '',
      especialidade:   profile?.especialidade ?? '',
      newPassword:     '',
      confirmPassword: '',
    });
    this.error.set(null);
    this.success.set(false);
    this.editing.set(true);
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
    const userPayload: Record<string, unknown> = {
      nome: v.nome,
      email: v.email,
      genero: v.genero,
      data_nascimento: v.data_nascimento,
    };
    if (v.newPassword) {
      userPayload['password'] = v.newPassword;
    }

    this.auth.updateUser(userPayload).subscribe({
      next: () => {
        const profile = this.profile();
        if (profile) {
          this.psiSvc.updateProfile(profile._id, { especialidade: v.especialidade ?? '' }).subscribe({
            next: updated => {
              // PUT /api/psicologos/:id doesn't return `pacientes` (only GET /me does) —
              // preserve the existing list so the count doesn't briefly show 0.
              this.profile.set({ ...profile, ...updated, pacientes: profile.pacientes });
              this.saving.set(false);
              this.editing.set(false);
              this.success.set(true);
            },
            error: err => {
              this.saving.set(false);
              this.error.set(err.error?.error ?? 'Erro ao atualizar dados profissionais.');
            },
          });
        } else {
          this.saving.set(false);
          this.editing.set(false);
          this.success.set(true);
        }
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err.error?.error ?? 'Erro ao atualizar perfil.');
      },
    });
  }
}
