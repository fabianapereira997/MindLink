import { Component, inject, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { todayDateString, minBirthDateString } from '../../../core/utils/date.utils';

const API = 'http://localhost:8080/api';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
  ],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class RegisterComponent {
  private fb     = inject(FormBuilder);
  private http   = inject(HttpClient);
  private router = inject(Router);

  hidePassword  = true;
  hideToken     = true;

  /** Today's date ('YYYY-MM-DD'); data de nascimento cannot be later than this. */
  readonly maxBirthDate = todayDateString();
  /** Earliest allowed birth date ('YYYY-MM-DD'); age cannot exceed 120 years. */
  readonly minBirthDate = minBirthDateString();
  loading       = signal(false);
  error         = signal<string | null>(null);
  success       = signal(false);

  form = this.fb.group({
    nome:            ['', [Validators.required, Validators.minLength(2)]],
    email:           ['', [Validators.required, Validators.email]],
    password:        ['', [Validators.required, Validators.minLength(6), Validators.pattern(/.*[0-9].*/)]],
    genero:          ['outro', Validators.required],
    data_nascimento: ['', Validators.required],
    adminToken:      ['', Validators.required],
  });

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Existem campos inválidos ou em falta. Verifique os campos assinalados.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    const { nome, email, password, genero, data_nascimento, adminToken } = this.form.value;
    this.http.post(`${API}/users/register`, {
      nome, email, password, genero, data_nascimento, tipo: 'admin', adminToken,
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.error ?? 'Erro ao criar conta. Verifique os dados.');
      },
    });
  }
}
