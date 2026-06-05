import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AuthService } from '../../../core/auth/auth.service';
import { PacienteService, PacienteProfile } from '../../../core/services/paciente.service';

@Component({
  selector: 'app-paciente-perfil',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class PacientePerfilComponent implements OnInit {
  auth    = inject(AuthService);
  private pacSvc = inject(PacienteService);

  profile = signal<PacienteProfile | null>(null);
  loading = signal(true);

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
}
