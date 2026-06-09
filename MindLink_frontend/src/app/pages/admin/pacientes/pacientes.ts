import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminService, AdminPaciente } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-pacientes',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './pacientes.html',
  styleUrl: './pacientes.css',
})
export class AdminPacientesComponent implements OnInit {
  private adminSvc = inject(AdminService);

  pacientes  = signal<AdminPaciente[]>([]);
  loading    = signal(true);
  error      = signal<string | null>(null);
  searchTerm = signal('');
  filterPsi  = signal('');

  get psicologoOptions(): string[] {
    const names = this.pacientes()
      .map(p => p.psicologo?.user?.nome ?? 'Sem psicólogo')
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
    return ['', ...names];
  }

  get filtered(): AdminPaciente[] {
    const q   = this.searchTerm().toLowerCase();
    const psi = this.filterPsi();
    return this.pacientes().filter(p => {
      const matchQ   = !q || p.user.nome.toLowerCase().includes(q) || p.user.email.toLowerCase().includes(q);
      const matchPsi = !psi || (p.psicologo?.user?.nome ?? 'Sem psicólogo') === psi;
      return matchQ && matchPsi;
    });
  }

  ngOnInit(): void {
    this.adminSvc.getPacientes().subscribe({
      next: list => { this.pacientes.set(list); this.loading.set(false); },
      error: err => { this.error.set(err.error?.error ?? 'Erro ao carregar.'); this.loading.set(false); },
    });
  }
}
