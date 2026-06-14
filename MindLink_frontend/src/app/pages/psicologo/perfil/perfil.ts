import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  ReactiveFormsModule, FormBuilder, Validators,
  AbstractControl, ValidationErrors,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../../core/auth/auth.service';
import { PsicologoService, PsicologoProfile } from '../../../core/services/psicologo.service';
import { todayDateString, minBirthDateString, calcularIdade } from '../../../core/utils/date.utils';

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
    MatFormFieldModule, MatInputModule, MatSelectModule,
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
  success  = signal(false);
  hideNew     = true;
  hideConfirm = true;

  /** Today's date ('YYYY-MM-DD'); data de nascimento cannot be later than this. */
  readonly maxBirthDate = todayDateString();
  /** Earliest allowed birth date ('YYYY-MM-DD'); age cannot exceed 120 years. */
  readonly minBirthDate = minBirthDateString();

  // ── Editar dados pessoais ───────────────────────────────────────────────
  editandoPessoais = signal(false);
  savingPessoais   = signal(false);
  pessoaisError    = signal<string | null>(null);

  pessoaisForm = this.fb.group({
    nome:            ['', Validators.required],
    email:           ['', [Validators.required, Validators.email]],
    genero:          ['', Validators.required],
    data_nascimento: ['', Validators.required],
    newPassword:     ['', [Validators.minLength(6), Validators.pattern(/.*[0-9].*/)]],
    confirmPassword: [''],
  }, { validators: passwordsMatch });

  // ── Editar dados profissionais ──────────────────────────────────────────
  editandoProfissionais = signal(false);
  savingProfissionais   = signal(false);
  profissionaisError    = signal<string | null>(null);

  profissionaisForm = this.fb.group({
    especialidade: ['', Validators.required],
  });

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

  generoLabel(): string {
    const g = this.auth.user()?.genero;
    if (!g) return '—';
    return g.charAt(0).toUpperCase() + g.slice(1);
  }

  idade(): number | null {
    const data = this.auth.user()?.data_nascimento;
    return data ? calcularIdade(data) : null;
  }

  // ── Dados pessoais ───────────────────────────────────────────────────────
  startEditPessoais(): void {
    const user = this.auth.user();
    this.pessoaisForm.reset({
      nome:            user?.nome ?? '',
      email:           user?.email ?? '',
      genero:          user?.genero ?? '',
      data_nascimento: user?.data_nascimento ? user.data_nascimento.substring(0, 10) : '',
      newPassword:     '',
      confirmPassword: '',
    });
    this.pessoaisError.set(null);
    this.success.set(false);
    this.editandoPessoais.set(true);
  }

  cancelEditPessoais(): void {
    if (this.savingPessoais()) return;
    this.editandoPessoais.set(false);
  }

  savePessoais(): void {
    if (this.pessoaisForm.invalid) {
      this.pessoaisForm.markAllAsTouched();
      this.pessoaisError.set('Existem campos inválidos ou em falta. Verifique os campos assinalados.');
      return;
    }
    this.savingPessoais.set(true);
    this.pessoaisError.set(null);

    const v = this.pessoaisForm.value;
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
        this.savingPessoais.set(false);
        this.editandoPessoais.set(false);
        this.success.set(true);
      },
      error: err => {
        this.savingPessoais.set(false);
        this.pessoaisError.set(err.error?.error ?? 'Erro ao atualizar dados pessoais.');
      },
    });
  }

  // ── Dados profissionais ──────────────────────────────────────────────────
  startEditProfissionais(): void {
    const profile = this.profile();
    this.profissionaisForm.reset({
      especialidade: profile?.especialidade ?? '',
    });
    this.profissionaisError.set(null);
    this.success.set(false);
    this.editandoProfissionais.set(true);
  }

  cancelEditProfissionais(): void {
    if (this.savingProfissionais()) return;
    this.editandoProfissionais.set(false);
  }

  saveProfissionais(): void {
    if (this.profissionaisForm.invalid) {
      this.profissionaisForm.markAllAsTouched();
      this.profissionaisError.set('Existem campos inválidos ou em falta. Verifique os campos assinalados.');
      return;
    }
    const profile = this.profile();
    if (!profile) return;
    this.savingProfissionais.set(true);
    this.profissionaisError.set(null);

    const v = this.profissionaisForm.value;
    this.psiSvc.updateProfile(profile._id, { especialidade: v.especialidade ?? '' }).subscribe({
      next: updated => {
        // PUT /api/psicologos/:id doesn't return `pacientes` (only GET /me does) —
        // preserve the existing list so the count doesn't briefly show 0.
        this.profile.set({ ...profile, ...updated, pacientes: profile.pacientes });
        this.savingProfissionais.set(false);
        this.editandoProfissionais.set(false);
        this.success.set(true);
      },
      error: err => {
        this.savingProfissionais.set(false);
        this.profissionaisError.set(err.error?.error ?? 'Erro ao atualizar dados profissionais.');
      },
    });
  }
}
