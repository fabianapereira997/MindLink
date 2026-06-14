import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';

const API = 'http://localhost:8080/api';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const pw  = control.get('newPassword')?.value;
  const pw2 = control.get('confirmPassword')?.value;
  return pw && pw2 && pw !== pw2 ? { mismatch: true } : null;
}

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  templateUrl: './change-password.html',
  styleUrl: './change-password.css',
})
export class ChangePasswordComponent {
  private fb   = inject(FormBuilder);
  private http = inject(HttpClient);
  auth         = inject(AuthService);

  hideNew     = true;
  hideConfirm = true;
  loading     = signal(false);
  error       = signal<string | null>(null);
  done        = signal(false);

  isForced = this.auth.mustChangePassword();

  form = this.fb.group({
    newPassword:     ['', [Validators.required, Validators.minLength(6), Validators.pattern(/.*[0-9].*/)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordsMatch });

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);

    const { newPassword } = this.form.value;
    this.http.post(`${API}/users/change-password`, { newPassword }).subscribe({
      next: () => {
        this.loading.set(false);
        this.done.set(true);
        this.auth.clearMustChangePassword();
        setTimeout(() => this.auth.redirectAfterLogin(), 1800);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.error ?? 'Erro ao alterar a password.');
      },
    });
  }
}
