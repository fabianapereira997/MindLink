import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';

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

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.adminSvc.getPsicologoDetalhe(id).subscribe({
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

  countEstado(consultas: any[], estado: string): number {
    return consultas.filter(c => c.estado === estado).length;
  }
}
