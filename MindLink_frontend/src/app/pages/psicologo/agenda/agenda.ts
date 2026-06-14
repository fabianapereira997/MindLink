import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
  private route       = inject(ActivatedRoute);

  allConsultas = signal<Consulta[]>([]);
  loading      = signal(true);
  weekStart    = signal<Date>(this.getMonday(new Date()));

  // ── Vista da grelha semanal: compacta (padrão) ou expandida (grelha horária) ──
  expandido    = signal(false);

  toggleExpandido(): void {
    this.expandido.update(v => !v);
  }

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

  // ── Marcar como realizada (modal de observações) ────────────────────────────
  realizandoConsulta = signal<Consulta | null>(null);
  realizarNotas      = signal('');
  realizarSaving     = signal(false);

  // ── Detalhe da consulta (modal ao clicar num cartão da semana) ─────────────
  detalheConsulta = signal<Consulta | null>(null);
  editandoDetalhe = signal(false);

  // ── Grelha horária do calendário semanal (9h-19h) ───────────────────────────
  readonly START_HOUR  = 9;
  readonly END_HOUR    = 19;
  readonly HOUR_HEIGHT = 68; // px por hora
  /** Altura total da grelha, com uma margem extra para o rótulo da última hora (19:00) não ficar cortado. */
  readonly gridHeight  = (this.END_HOUR - this.START_HOUR) * this.HOUR_HEIGHT + 16;

  /** Marcas horárias (09:00, 10:00, ... 19:00), para os rótulos da grelha. */
  hourMarks = computed(() => {
    const marks: { hour: number; label: string }[] = [];
    for (let h = this.START_HOUR; h <= this.END_HOUR; h++) {
      marks.push({ hour: h, label: `${h.toString().padStart(2, '0')}:00` });
    }
    return marks;
  });

  /** Posição/altura (em px) do cartão de uma consulta na grelha, com base na hora e duração. */
  slotStyle(c: Consulta): { top: string; height: string } {
    const d = new Date(c.data);
    const startMin = (d.getHours() - this.START_HOUR) * 60 + d.getMinutes();
    const top = (startMin / 60) * this.HOUR_HEIGHT;
    const height = (c.duracao / 60) * this.HOUR_HEIGHT;
    return { top: `${top}px`, height: `${Math.max(height, 32)}px` };
  }

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
    this.route.queryParamMap.subscribe(params => {
      const dataParam = params.get('data');
      if (dataParam) {
        const d = new Date(dataParam);
        if (!isNaN(d.getTime())) this.weekStart.set(this.getMonday(d));
      }
    });

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
    if (dataHora.getTime() < Date.now()) {
      this.formError.set('Não é possível agendar uma consulta para uma data/hora que já passou.');
      return;
    }
    if (dataHora.getDay() === 0 || dataHora.getDay() === 6) {
      this.formError.set('Não é possível agendar consultas ao fim de semana.');
      return;
    }
    if (!this.isWithinClinicHours(dataHora, this.novaDuracao())) {
      this.formError.set('A consulta deve ser agendada entre as 9:00 e as 19:00.');
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
    this.realizarNotas.set(c.notas ?? '');
    this.realizandoConsulta.set(c);
  }

  fecharRealizarModal(): void {
    if (this.realizarSaving()) return;
    this.realizandoConsulta.set(null);
    this.realizarNotas.set('');
  }

  confirmarRealizacao(): void {
    const c = this.realizandoConsulta();
    if (!c) return;

    this.realizarSaving.set(true);
    this.consultaSvc.updateConsulta(c._id, { estado: 'realizada', notas: this.realizarNotas() }).subscribe({
      next: updated => {
        this.allConsultas.update(list => list.map(x => x._id === updated._id ? updated : x));
        this.realizarSaving.set(false);
        this.realizandoConsulta.set(null);
        this.realizarNotas.set('');
      },
      error: err => {
        this.realizarSaving.set(false);
        alert(err.error?.error ?? 'Erro ao atualizar a consulta.');
      },
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
    if (novaDataHora.getTime() < Date.now()) {
      this.reagendarError.set('Não é possível reagendar para uma data/hora que já passou.');
      return;
    }
    if (novaDataHora.getDay() === 0 || novaDataHora.getDay() === 6) {
      this.reagendarError.set('Não é possível agendar consultas ao fim de semana.');
      return;
    }
    if (!this.isWithinClinicHours(novaDataHora, c.duracao)) {
      this.reagendarError.set('A consulta deve ser agendada entre as 9:00 e as 19:00.');
      return;
    }

    this.reagendarSaving.set(true);
    this.consultaSvc.updateConsulta(c._id, { data: novaDataHora.toISOString() }).subscribe({
      next: updated => {
        this.allConsultas.update(list => list.map(x => x._id === updated._id ? updated : x));
        this.reagendarSaving.set(false);
        this.reagendandoId.set(null);
        if (this.detalheConsulta()?._id === updated._id) {
          this.detalheConsulta.set(updated);
          this.editandoDetalhe.set(false);
        }
      },
      error: err => {
        this.reagendarError.set(err.error?.error ?? 'Erro ao reagendar a consulta.');
        this.reagendarSaving.set(false);
      },
    });
  }

  // ── Modal de detalhe da consulta (cartões da grelha semanal) ────────────────
  abrirDetalhe(c: Consulta): void {
    this.detalheConsulta.set(c);
    this.editandoDetalhe.set(false);
  }

  fecharDetalhe(): void {
    this.detalheConsulta.set(null);
    this.editandoDetalhe.set(false);
  }

  editarDetalhe(): void {
    const c = this.detalheConsulta();
    if (!c) return;
    this.toggleReagendar(c);
    this.editandoDetalhe.set(true);
  }

  cancelarEdicaoDetalhe(): void {
    const c = this.detalheConsulta();
    if (!c) return;
    this.toggleReagendar(c);
    this.editandoDetalhe.set(false);
  }

  confirmarEdicaoDetalhe(): void {
    const c = this.detalheConsulta();
    if (!c) return;
    this.confirmarReagendamento(c);
  }

  cancelarDaDetalhe(): void {
    const c = this.detalheConsulta();
    if (!c) return;
    this.fecharDetalhe();
    this.cancelarConsulta(c);
  }

  marcarRealizadaDaDetalhe(): void {
    const c = this.detalheConsulta();
    if (!c) return;
    this.fecharDetalhe();
    this.marcarRealizada(c);
  }

  /** Returns true if `inicio` plus `duracaoMin` minutes falls entirely within 9:00–19:00 on the same day. */
  private isWithinClinicHours(inicio: Date, duracaoMin: number): boolean {
    const fim = new Date(inicio.getTime() + duracaoMin * 60_000);
    const OPEN = 9 * 60;
    const CLOSE = 19 * 60;
    const inicioMin = inicio.getHours() * 60 + inicio.getMinutes();
    const fimMin = fim.getHours() * 60 + fim.getMinutes();
    const sameDay = inicio.getFullYear() === fim.getFullYear()
      && inicio.getMonth() === fim.getMonth()
      && inicio.getDate() === fim.getDate();
    return sameDay && inicioMin >= OPEN && fimMin <= CLOSE;
  }

  estadoLabel(estado: string): string {
    if (estado === 'pendente') return 'Por confirmar';
    if (estado === 'realizada') return 'Realizada';
    if (estado === 'cancelada') return 'Cancelada';
    return 'Agendada';
  }

  estadoClass(estado: string): string {
    if (estado === 'pendente') return 'badge--pendente';
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
