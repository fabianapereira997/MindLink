import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PacienteService } from '../../../core/services/paciente.service';
import { ConsultaService, Consulta } from '../../../core/services/consulta.service';
import { DesafioService, Desafio } from '../../../core/services/desafio.service';

interface WeekDay {
  iso: string;
  num: string;
  weekday: string;
  isToday: boolean;
}

@Component({
  selector: 'app-paciente-agenda',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, MatFormFieldModule, MatInputModule],
  templateUrl: './agenda.html',
  styleUrl: './agenda.css',
})
export class PacienteAgendaComponent implements OnInit {
  private pacSvc      = inject(PacienteService);
  private consultaSvc = inject(ConsultaService);
  private desafioSvc  = inject(DesafioService);

  loading       = signal(true);
  profileError  = signal<string | null>(null);
  consultaError = signal<string | null>(null);
  desafioError  = signal<string | null>(null);

  allConsultas  = signal<Consulta[]>([]);
  allDesafios   = signal<Desafio[]>([]);
  weekStart     = signal<Date>(this.getMonday(new Date()));

  // "Marcar como feito" modal — comentário opcional + resposta obrigatória (se aplicável)
  desafioToComplete = signal<Desafio | null>(null);
  comentarioInput   = signal('');
  respostaInput     = signal('');
  respostaError     = signal<string | null>(null);
  completing        = signal(false);

  // ── Week navigation ──────────────────────────────────────────────────────────

  weekDays = computed<WeekDay[]>(() => {
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
  });

  weekLabel = computed(() => {
    const days = this.weekDays();
    const first = new Date(days[0].iso);
    const last  = new Date(days[6].iso);
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${first.toLocaleDateString('pt-PT', opts)} – ${last.toLocaleDateString('pt-PT', opts)} ${last.getFullYear()}`;
  });

  weekConsultas = computed(() => {
    const isos = new Set(this.weekDays().map(d => d.iso));
    return this.allConsultas()
      .filter(c => isos.has(this.toLocalISODate(new Date(c.data))))
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  });

  // ── Date helpers ────────────────────────────────────────────────────────────

  /** Verdadeiro se o prazo do desafio (data_fim, ou calculado a partir de createdAt) já passou. */
  isPastDeadline(d: Desafio): boolean {
    return this.prazoData(d).getTime() < Date.now();
  }

  /** Data/hora limite para cumprir o desafio. */
  private prazoData(d: Desafio): Date {
    if (d.data_fim) return new Date(d.data_fim);
    const fim = new Date(d.createdAt!);
    if (d.tipo === 'diario') {
      fim.setHours(23, 59, 59, 999);
    } else {
      fim.setDate(fim.getDate() + 7);
    }
    return fim;
  }

  /** Mensagem a indicar até quando o paciente tem para cumprir o desafio. */
  prazoLabel(d: Desafio): string {
    if (d.tipo === 'diario') {
      return 'Tem até ao final do dia de hoje para cumprir este desafio.';
    }
    const fim = this.prazoData(d);
    const dd = String(fim.getDate()).padStart(2, '0');
    const mm = String(fim.getMonth() + 1).padStart(2, '0');
    const yyyy = fim.getFullYear();
    const hh = String(fim.getHours()).padStart(2, '0');
    const min = String(fim.getMinutes()).padStart(2, '0');
    return `Tem até ${dd}/${mm}/${yyyy} às ${hh}:${min} para cumprir este desafio.`;
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

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.pacSvc.getMyProfile().subscribe({
      next: profiles => {
        this.loading.set(false);
        if (!profiles.length) {
          this.profileError.set('Perfil de paciente não encontrado. Contacte o seu psicólogo.');
          return;
        }
        this.loadSubData(profiles[0]._id);
      },
      error: err => {
        this.loading.set(false);
        this.profileError.set(err.error?.error ?? `Erro ${err.status ?? ''}: não foi possível carregar o perfil.`);
      },
    });
  }

  private loadSubData(pacienteId: string): void {
    this.consultaSvc.getConsultasForPaciente(pacienteId).subscribe({
      next: cs => this.allConsultas.set(cs),
      error: err => this.consultaError.set(err.error?.error ?? `Erro ${err.status ?? ''} ao carregar consultas.`),
    });

    this.desafioSvc.getDesafiosForPaciente(pacienteId).subscribe({
      next: ds => this.allDesafios.set(ds),
      error: err => this.desafioError.set(err.error?.error ?? `Erro ${err.status ?? ''} ao carregar desafios.`),
    });
  }

  // ── Week navigation ──────────────────────────────────────────────────────────

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

  consultasForDay(iso: string): Consulta[] {
    return this.allConsultas()
      .filter(c => this.toLocalISODate(new Date(c.data)) === iso)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  }

  /** Todos os desafios cujo prazo (data_fim, ou fim do dia/semana) cai neste dia. */
  desafiosForDay(iso: string): Desafio[] {
    return this.allDesafios()
      .filter(d => this.toLocalISODate(this.prazoData(d)) === iso)
      .sort((a, b) => this.prazoData(a).getTime() - this.prazoData(b).getTime());
  }

  estadoLabel(estado: string): string {
    if (estado === 'realizada') return 'Realizada';
    if (estado === 'cancelada') return 'Cancelada';
    return 'Agendada';
  }

  estadoClass(estado: string): string {
    if (estado === 'realizada') return 'badge--realizada';
    if (estado === 'cancelada') return 'badge--cancelada';
    return 'badge--agendada';
  }

  // ── Marcar desafio como feito ───────────────────────────────────────────────

  abrirCompletarModal(d: Desafio): void {
    this.desafioToComplete.set(d);
    this.comentarioInput.set('');
    this.respostaInput.set('');
    this.respostaError.set(null);
  }

  cancelarCompletar(): void {
    if (this.completing()) return;
    this.desafioToComplete.set(null);
    this.comentarioInput.set('');
    this.respostaInput.set('');
    this.respostaError.set(null);
  }

  confirmarCompletar(): void {
    const d = this.desafioToComplete();
    if (!d) return;

    const resposta = this.respostaInput().trim();
    if (d.respostaObrigatoria && !resposta) {
      this.respostaError.set('Este desafio exige uma resposta escrita.');
      return;
    }
    this.respostaError.set(null);

    this.completing.set(true);
    const comentario = this.comentarioInput().trim();
    this.desafioSvc.marcarConcluido(d._id, comentario || undefined, resposta || undefined).subscribe({
      next: updated => {
        this.allDesafios.update(list => list.map(x => x._id === updated._id ? updated : x));
        this.completing.set(false);
        this.desafioToComplete.set(null);
        this.comentarioInput.set('');
        this.respostaInput.set('');
      },
      error: err => {
        console.error('marcarConcluido error:', err);
        this.completing.set(false);
        this.respostaError.set(err.error?.error ?? 'Erro ao confirmar. Tente novamente.');
      },
    });
  }
}
