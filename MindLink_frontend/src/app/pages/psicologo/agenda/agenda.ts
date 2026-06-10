import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ConsultaService, Consulta } from '../../../core/services/consulta.service';
import { PsicologoService } from '../../../core/services/psicologo.service';
import { todayDateString } from '../../../core/utils/date.utils';

interface WeekDay {
  iso: string;
  num: string;
  weekday: string;
  isToday: boolean;
}

interface PacienteBasic {
  _id: string;
  user?: { nome?: string };
}

@Component({
  selector: 'app-psicologo-agenda',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './agenda.html',
  styleUrl: './agenda.css',
})
export class PsicologoAgendaComponent implements OnInit {
  private consultaSvc = inject(ConsultaService);
  private psiSvc      = inject(PsicologoService);

  allConsultas = signal<Consulta[]>([]);
  loading      = signal(true);
  weekStart    = signal<Date>(this.getMonday(new Date()));

  /** Today's date ('YYYY-MM-DD'); novas/reagendadas consultas não podem ser no passado. */
  readonly minConsultaDate = todayDateString();

  // ── Nova consulta form ───────────────────────────────────────────────────────
  pacientes      = signal<PacienteBasic[]>([]);
  showForm       = signal(false);
  saving         = signal(false);
  formError      = signal<string | null>(null);
  formSuccess    = signal(false);

  novaPaciente   = signal('');
  novaData       = signal('');   // yyyy-MM-dd
  novaHora       = signal('');   // HH:mm
  novaDuracao    = signal(50);
  novaNotas      = signal('');

  // ── Reagendar consulta ───────────────────────────────────────────────────────
  reagendandoId  = signal<string | null>(null);
  reagendarData  = signal('');   // yyyy-MM-dd
  reagendarHora  = signal('');   // HH:mm
  reagendarError = signal<string | null>(null);
  reagendarSaving = signal(false);

  // ── Cancelar consulta (modal de confirmação) ────────────────────────────────
  cancelandoConsulta = signal<Consulta | null>(null);
  cancelarSaving     = signal(false);

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

  ngOnInit(): void {
    this.consultaSvc.getConsultasForPsicologo().subscribe({
      next: cs => { this.allConsultas.set(cs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });

    this.psiSvc.getMyProfile().subscribe({
      next: profile => this.pacientes.set((profile?.pacientes ?? []) as PacienteBasic[]),
    });
  }

  consultasForDay(iso: string): Consulta[] {
    return this.allConsultas()
      .filter(c => this.toLocalISODate(new Date(c.data)) === iso)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  }

  /** Local-timezone date as 'yyyy-MM-dd', avoiding the UTC-shift bug of toISOString(). */
  private toLocalISODate(d: Date): string {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
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

  toggleForm(): void {
    this.showForm.update(v => !v);
    if (this.showForm()) {
      this.formError.set(null);
      this.formSuccess.set(false);
      // Default to today's date for convenience
      if (!this.novaData()) {
        this.novaData.set(new Date().toISOString().slice(0, 10));
      }
    }
  }

  criarConsulta(): void {
    this.formError.set(null);
    this.formSuccess.set(false);

    if (!this.novaPaciente()) {
      this.formError.set('Selecione um paciente.');
      return;
    }
    if (!this.novaData() || !this.novaHora()) {
      this.formError.set('Indique a data e a hora da consulta.');
      return;
    }
    if (!this.novaDuracao() || this.novaDuracao() <= 0) {
      this.formError.set('A duração deve ser superior a 0 minutos.');
      return;
    }

    const dataHora = new Date(`${this.novaData()}T${this.novaHora()}`);
    if (isNaN(dataHora.getTime())) {
      this.formError.set('Data ou hora inválida.');
      return;
    }

    this.saving.set(true);
    this.consultaSvc.criarConsulta({
      paciente: this.novaPaciente(),
      data: dataHora.toISOString(),
      duracao: this.novaDuracao(),
      notas: this.novaNotas() || undefined,
    }).subscribe({
      next: c => {
        this.allConsultas.update(list => [...list, c]);
        this.formSuccess.set(true);
        this.saving.set(false);
        this.novaPaciente.set('');
        this.novaHora.set('');
        this.novaNotas.set('');
        this.novaDuracao.set(50);
        setTimeout(() => { this.showForm.set(false); this.formSuccess.set(false); }, 1200);
      },
      error: err => {
        this.formError.set(err.error?.error ?? 'Erro ao agendar a consulta.');
        this.saving.set(false);
      },
    });
  }

  /** True if the consulta's date is today (local time). */
  isHoje(c: Consulta): boolean {
    return this.toLocalISODate(new Date(c.data)) === this.toLocalISODate(new Date());
  }

  cancelarConsulta(c: Consulta): void {
    this.cancelandoConsulta.set(c);
  }

  fecharCancelarModal(): void {
    if (this.cancelarSaving()) return;
    this.cancelandoConsulta.set(null);
  }

  confirmarCancelamento(): void {
    const c = this.cancelandoConsulta();
    if (!c) return;

    this.cancelarSaving.set(true);
    this.consultaSvc.updateConsulta(c._id, { estado: 'cancelada' }).subscribe({
      next: updated => {
        this.allConsultas.update(list => list.map(x => x._id === updated._id ? updated : x));
        this.cancelarSaving.set(false);
        this.cancelandoConsulta.set(null);
      },
      error: err => {
        this.cancelarSaving.set(false);
        alert(err.error?.error ?? 'Erro ao cancelar a consulta.');
      },
    });
  }

  marcarRealizada(c: Consulta): void {
    this.consultaSvc.updateConsulta(c._id, { estado: 'realizada' }).subscribe({
      next: updated => {
        this.allConsultas.update(list => list.map(x => x._id === updated._id ? updated : x));
      },
      error: err => alert(err.error?.error ?? 'Erro ao atualizar a consulta.'),
    });
  }

  toggleReagendar(c: Consulta): void {
    if (this.reagendandoId() === c._id) {
      this.reagendandoId.set(null);
      return;
    }
    const d = new Date(c.data);
    this.reagendarData.set(this.toLocalISODate(d));
    this.reagendarHora.set(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    this.reagendarError.set(null);
    this.reagendandoId.set(c._id);
  }

  confirmarReagendamento(c: Consulta): void {
    this.reagendarError.set(null);

    if (!this.reagendarData() || !this.reagendarHora()) {
      this.reagendarError.set('Indique a nova data e hora.');
      return;
    }

    const novaDataHora = new Date(`${this.reagendarData()}T${this.reagendarHora()}`);
    if (isNaN(novaDataHora.getTime())) {
      this.reagendarError.set('Data ou hora inválida.');
      return;
    }

    this.reagendarSaving.set(true);
    this.consultaSvc.updateConsulta(c._id, { data: novaDataHora.toISOString() }).subscribe({
      next: updated => {
        this.allConsultas.update(list => list.map(x => x._id === updated._id ? updated : x));
        this.reagendarSaving.set(false);
        this.reagendandoId.set(null);
      },
      error: err => {
        this.reagendarError.set(err.error?.error ?? 'Erro ao reagendar a consulta.');
        this.reagendarSaving.set(false);
      },
    });
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

  private getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
