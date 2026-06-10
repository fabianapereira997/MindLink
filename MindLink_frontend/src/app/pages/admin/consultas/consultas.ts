import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ConsultaService, Consulta } from '../../../core/services/consulta.service';
import { todayDateString } from '../../../core/utils/date.utils';

type EstadoFiltro = 'todas' | 'agendada' | 'realizada' | 'cancelada';

@Component({
  selector: 'app-admin-consultas',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './consultas.html',
  styleUrl: './consultas.css',
})
export class AdminConsultasComponent implements OnInit {
  private consultaSvc = inject(ConsultaService);

  consultas = signal<Consulta[]>([]);
  loading   = signal(true);
  error     = signal<string | null>(null);
  success   = signal<string | null>(null);

  estadoFiltro = signal<EstadoFiltro>('todas');
  filterPsi    = signal('');
  filterPac    = signal('');
  filterData   = signal('');

  confirmDeleteId = signal<string | null>(null);
  savingId        = signal<string | null>(null);

  /** Today's date ('YYYY-MM-DD'); the date filter cannot go beyond this. */
  readonly maxFilterDate = todayDateString();

  get psicologoOptions(): string[] {
    const names = this.consultas()
      .map(c => c.psicologo?.user?.nome ?? 'Desconhecido')
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
    return names;
  }

  get pacienteOptions(): string[] {
    const names = this.consultas()
      .map(c => c.paciente?.user?.nome ?? 'Desconhecido')
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
    return names;
  }

  get filtered(): Consulta[] {
    const estado = this.estadoFiltro();
    const psi    = this.filterPsi();
    const pac    = this.filterPac();
    const data   = this.filterData();

    return this.consultas()
      .filter(c => {
        const matchEstado = estado === 'todas' || c.estado === estado;
        const matchPsi    = !psi || (c.psicologo?.user?.nome ?? 'Desconhecido') === psi;
        const matchPac    = !pac || (c.paciente?.user?.nome ?? 'Desconhecido') === pac;
        const matchData   = !data || c.data.slice(0, 10) === data;
        return matchEstado && matchPsi && matchPac && matchData;
      })
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }

  get countAgendadas(): number {
    return this.consultas().filter(c => c.estado === 'agendada').length;
  }

  get countRealizadas(): number {
    return this.consultas().filter(c => c.estado === 'realizada').length;
  }

  get countCanceladas(): number {
    return this.consultas().filter(c => c.estado === 'cancelada').length;
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.consultaSvc.getAllConsultas().subscribe({
      next: list => { this.consultas.set(list); this.loading.set(false); },
      error: err => { this.error.set(err.error?.error ?? 'Erro ao carregar consultas.'); this.loading.set(false); },
    });
  }

  clearFilters(): void {
    this.estadoFiltro.set('todas');
    this.filterPsi.set('');
    this.filterPac.set('');
    this.filterData.set('');
  }

  changeEstado(consulta: Consulta, novoEstado: string): void {
    if (novoEstado === consulta.estado) return;
    this.error.set(null);
    this.success.set(null);
    this.savingId.set(consulta._id);

    this.consultaSvc.updateConsulta(consulta._id, { estado: novoEstado as Consulta['estado'] }).subscribe({
      next: updated => {
        this.consultas.update(list => list.map(c => c._id === updated._id ? updated : c));
        this.savingId.set(null);
        this.success.set('Estado atualizado com sucesso.');
      },
      error: err => {
        this.savingId.set(null);
        this.error.set(err.error?.error ?? 'Erro ao atualizar estado.');
      },
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

    this.consultaSvc.deleteConsulta(id).subscribe({
      next: () => {
        this.consultas.update(list => list.filter(c => c._id !== id));
        this.confirmDeleteId.set(null);
        this.success.set('Consulta eliminada com sucesso.');
      },
      error: err => {
        this.confirmDeleteId.set(null);
        this.error.set(err.error?.error ?? 'Erro ao eliminar consulta.');
      },
    });
  }
}
