import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ConsultaService, Consulta } from '../../../core/services/consulta.service';

type EstadoFiltro = 'todas' | 'pendente' | 'agendada' | 'realizada' | 'cancelada';
type ViewMode = 'lista' | 'agenda';

interface WeekDay {
  iso: string;
  num: string;
  weekday: string;
  isToday: boolean;
}

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

  // ── Formato agenda (vista semanal) ──────────────────────────────────────────
  viewMode  = signal<ViewMode>('lista');
  weekStart = signal<Date>(this.getMonday(new Date()));

  confirmDeleteId = signal<string | null>(null);
  savingId        = signal<string | null>(null);

  /** Consulta selecionada para visualização de detalhes (vista agenda). */
  detalheTarget = signal<Consulta | null>(null);

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

  // ── Formato agenda (vista semanal) ──────────────────────────────────────────
  get weekDays(): WeekDay[] {
    const start = this.weekStart();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = this.toLocalISODate(d);
      const isToday = d.getTime() === today.getTime();
      return {
        iso,
        num: d.getDate().toString(),
        weekday: d.toLocaleDateString('pt-PT', { weekday: 'short' }),
        isToday,
      };
    });
  }

  get weekLabel(): string {
    const days = this.weekDays;
    const first = new Date(days[0].iso);
    const last  = new Date(days[6].iso);
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${first.toLocaleDateString('pt-PT', opts)} – ${last.toLocaleDateString('pt-PT', opts)} ${last.getFullYear()}`;
  }

  consultasForDay(iso: string): Consulta[] {
    return this.filtered
      .filter(c => this.toLocalISODate(new Date(c.data)) === iso)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  }

  prevWeek(): void {
    const d = new Date(this.weekStart());
    d.setDate(d.getDate() - 7);
    this.weekStart.set(d);
  }

  nextWeek(): void {
    const d = new Date(this.weekStart());
    d.setDate(d.getDate() + 7);
    this.weekStart.set(d);
  }

  goToToday(): void {
    this.weekStart.set(this.getMonday(new Date()));
  }

  /** Local-timezone date as 'yyyy-MM-dd', avoiding the UTC-shift bug of toISOString(). */
  private toLocalISODate(d: Date): string {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  get countPendentes(): number {
    return this.consultas().filter(c => c.estado === 'pendente').length;
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

  estadoLabel(estado: string): string {
    if (estado === 'pendente') return 'Por confirmar';
    if (estado === 'realizada') return 'Realizada';
    if (estado === 'cancelada') return 'Cancelada';
    return 'Agendada';
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

  // ── Detalhe da consulta (vista agenda) ──────────────────────────────────────
  openDetalhe(c: Consulta): void {
    this.detalheTarget.set(c);
  }

  closeDetalhe(): void {
    this.detalheTarget.set(null);
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
