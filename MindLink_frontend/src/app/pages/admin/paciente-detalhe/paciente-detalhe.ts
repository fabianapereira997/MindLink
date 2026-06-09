import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-paciente-detalhe',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './paciente-detalhe.html',
  styleUrl: './paciente-detalhe.css',
})
export class AdminPacienteDetalheComponent implements OnInit {
  private route    = inject(ActivatedRoute);
  private adminSvc = inject(AdminService);

  data    = signal<{ paciente: any; consultas: any[]; questionarios: any[] } | null>(null);
  loading = signal(true);
  error   = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.adminSvc.getPacienteDetalhe(id).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: err => { this.error.set(err.error?.error ?? 'Erro ao carregar.'); this.loading.set(false); },
    });
  }

  estadoLabel(e: string): string {
    return e === 'realizada' ? 'Realizada' : e === 'cancelada' ? 'Cancelada' : 'Agendada';
  }

  estadoClass(e: string): string {
    return e === 'realizada' ? 'badge--green' : e === 'cancelada' ? 'badge--red' : 'badge--amber';
  }

  humorColor(v: number): string {
    if (v >= 4.5) return '#26874E';
    if (v >= 3.5) return '#73C883';
    if (v >= 2.5) return '#eab308';
    if (v >= 1.5) return '#f97316';
    return '#dc2626';
  }

  avgMood(questionarios: any[]): string {
    if (!questionarios.length) return '—';
    return (questionarios.reduce((s, q) => s + q.humor, 0) / questionarios.length).toFixed(1);
  }

  countAgendadas(consultas: any[]): number {
    return consultas.filter(c => c.estado === 'agendada').length;
  }
}
