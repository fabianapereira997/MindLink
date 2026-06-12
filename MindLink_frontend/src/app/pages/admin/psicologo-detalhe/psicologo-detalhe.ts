import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { AdminService, AdminPsicologo } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-psicologo-detalhe',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './psicologo-detalhe.html',
  styleUrl: './psicologo-detalhe.css',
})
export class AdminPsicologoDetalheComponent implements OnInit {
  private route    = inject(ActivatedRoute);
  private adminSvc = inject(AdminService);

  data    = signal<{ psicologo: any; pacientes: any[]; consultas: any[] } | null>(null);
  loading = signal(true);
  error   = signal<string | null>(null);
  success = signal<string | null>(null);

  // ── Transferir pacientes (exportar/importar lista XML) ─────────────────────
  allPsicologos    = signal<AdminPsicologo[]>([]);
  showTransfer     = signal(false);
  transferTargetId = signal('');
  transferFile     = signal<File | null>(null);
  transferFileName = signal('');
  transferError    = signal<string | null>(null);
  transferring     = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.adminSvc.getPsicologoDetalhe(id).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: err => { this.error.set(err.error?.error ?? 'Erro ao carregar.'); this.loading.set(false); },
    });
    this.adminSvc.getPsicologos().subscribe({
      next: list => this.allPsicologos.set(list),
    });
  }

  /** Outros psicólogos disponíveis como destino de transferência. */
  get otherPsicologos(): AdminPsicologo[] {
    const id = this.data()?.psicologo?._id;
    return this.allPsicologos().filter(o => o._id !== id);
  }

  exportPacientes(): void {
    const d = this.data();
    if (!d) return;
    this.error.set(null);
    this.adminSvc.exportPacientesXml(d.psicologo._id).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pacientes-${(d.psicologo.user?.nome ?? 'psicologo').replace(/\s+/g, '_')}.xml`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: err => this.error.set(err.error?.error ?? 'Erro ao exportar lista de pacientes.'),
    });
  }

  openTransferModal(): void {
    this.transferTargetId.set('');
    this.transferFile.set(null);
    this.transferFileName.set('');
    this.transferError.set(null);
    this.showTransfer.set(true);
  }

  closeTransferModal(): void {
    if (this.transferring()) return;
    this.showTransfer.set(false);
  }

  onTransferFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.transferFile.set(file);
    this.transferFileName.set(file?.name ?? '');
  }

  submitTransfer(): void {
    const targetId = this.transferTargetId();
    const file = this.transferFile();

    this.transferError.set(null);

    if (!targetId) {
      this.transferError.set('Selecione o psicólogo de destino.');
      return;
    }
    if (!file) {
      this.transferError.set('Selecione o ficheiro XML exportado com a lista de pacientes.');
      return;
    }

    this.transferring.set(true);
    const reader = new FileReader();
    reader.onload = () => {
      const xml = reader.result as string;
      this.adminSvc.importPacientesXml(targetId, xml).subscribe({
        next: res => {
          this.transferring.set(false);
          this.showTransfer.set(false);
          this.success.set(`${res.atualizados} paciente(s) transferido(s) com sucesso.`);
        },
        error: err => {
          this.transferring.set(false);
          this.transferError.set(err.error?.error ?? 'Erro ao importar a lista de pacientes.');
        },
      });
    };
    reader.onerror = () => {
      this.transferring.set(false);
      this.transferError.set('Erro ao ler o ficheiro.');
    };
    reader.readAsText(file);
  }

  estadoLabel(e: string): string {
    return e === 'realizada' ? 'Realizada' : e === 'cancelada' ? 'Cancelada' : 'Agendada';
  }

  estadoClass(e: string): string {
    return e === 'realizada' ? 'badge--green' : e === 'cancelada' ? 'badge--red' : 'badge--amber';
  }

  countEstado(consultas: any[], estado: string): number {
    return consultas.filter(c => c.estado === estado).length;
  }
}
