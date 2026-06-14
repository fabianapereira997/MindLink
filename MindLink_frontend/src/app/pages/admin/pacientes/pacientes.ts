import { Component, inject, OnInit, signal, HostListener } from '@angular/core';
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
  success    = signal<string | null>(null);
  searchTerm = signal('');
  filterPsi  = signal('');

  confirmDeleteId = signal<string | null>(null);

  confirmInativarTarget = signal<AdminPaciente | null>(null);

  /** Id do paciente cujo menu de ações (⋯) está aberto, ou null se nenhum estiver. */
  menuAbertoId = signal<string | null>(null);

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
    this.load();
  }

  private load(): void {
    this.adminSvc.getPacientes().subscribe({
      next: list => { this.pacientes.set(list); this.loading.set(false); },
      error: err => { this.error.set(err.error?.error ?? 'Erro ao carregar.'); this.loading.set(false); },
    });
  }

  askDelete(id: string): void {
    this.confirmDeleteId.set(id);
  }

  cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  confirmDelete(): void {
    const id = this.confirmDeleteId();
    if (!id) return;
    this.error.set(null);
    this.success.set(null);

    this.adminSvc.deletePaciente(id).subscribe({
      next: () => {
        this.pacientes.update(list => list.filter(p => p._id !== id));
        this.confirmDeleteId.set(null);
        this.success.set('Paciente eliminado com sucesso.');
      },
      error: err => {
        this.confirmDeleteId.set(null);
        this.error.set(err.error?.error ?? 'Erro ao eliminar paciente.');
      },
    });
  }

  // ── Ativar / inativar paciente ───────────────────────────────────────────────
  toggleAtivo(p: AdminPaciente): void {
    const novoEstado = !(p.ativo ?? true);
    if (novoEstado === false) {
      this.confirmInativarTarget.set(p);
      return;
    }
    this.applyAtivo(p, novoEstado);
  }

  cancelInativar(): void {
    this.confirmInativarTarget.set(null);
  }

  confirmInativar(): void {
    const p = this.confirmInativarTarget();
    if (!p) return;
    this.confirmInativarTarget.set(null);
    this.applyAtivo(p, false);
  }

  private applyAtivo(p: AdminPaciente, novoEstado: boolean): void {
    this.error.set(null);
    this.success.set(null);
    this.adminSvc.setPacienteAtivo(p._id, novoEstado).subscribe({
      next: updated => {
        this.pacientes.update(list => list.map(x => x._id === updated._id ? { ...x, ativo: updated.ativo } : x));
        this.success.set(novoEstado ? 'Paciente ativado com sucesso.' : 'Paciente inativado com sucesso.');
      },
      error: err => {
        this.error.set(err.error?.error ?? 'Erro ao alterar o estado do paciente.');
      },
    });
  }

  // ── Menu de ações (⋯) ────────────────────────────────────────────────────────
  toggleMenu(id: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuAbertoId.set(this.menuAbertoId() === id ? null : id);
  }

  @HostListener('document:click')
  fecharMenu(): void {
    this.menuAbertoId.set(null);
  }
}
