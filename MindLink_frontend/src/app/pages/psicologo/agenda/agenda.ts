import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ConsultaService, Consulta } from '../../core/services/consulta.service';

interface WeekDay {
  iso: string;
  num: string;
  weekday: string;
  isToday: boolean;
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

  allConsultas = signal<Consulta[]>([]);
  loading      = signal(true);
  weekStart    = signal<Date>(this.getMonday(new Date()));

  weekDays = computed<WeekDay[]>(() => {
    const start = this.weekStart();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
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
      .filter(c => isos.has(new Date(c.data).toISOString().slice(0, 10)))
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  });

  ngOnInit(): void {
    this.consultaSvc.getConsultasForPsicologo().subscribe({
      next: cs => { this.allConsultas.set(cs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  consultasForDay(iso: string): Consulta[] {
    return this.allConsultas()
      .filter(c => new Date(c.data).toISOString().slice(0, 10) === iso)
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
