import { Component } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-psicologo-dashboard',
  standalone: true,
  template: `
    <div class="container" style="padding: 4rem 0;">
      <h1>Dashboard — Psicólogo</h1>
      <p style="color: var(--color-text-secondary); margin-top: 0.5rem;">
        Bem-vindo, {{ auth.user()?.nome }}. Esta área está em construção.
      </p>
    </div>
  `,
})
export class PsicologoDashboardComponent {
  constructor(public auth: AuthService) {}
}
