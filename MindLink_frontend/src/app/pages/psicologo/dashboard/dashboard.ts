import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { PsicologoService, PsicologoProfile } from '../../../core/services/psicologo.service';
import { ConsultaService, Consulta } from '../../../core/services/consulta.service';
import { DesafioService, Desafio } from '../../../core/services/desafio.service';
import { QuestionarioService } from '../../../core/services/questionario.service';
import { ChatService } from '../../../core/services/chat.service';

export interface PacienteComStats {
  _id: string;
  user?: { nome?: string };
  avgHumor?: string;
  humorBaixo?: boolean;
  semRegistoHumor3Dias?: boolean;
}

export interface DesafioPendenteItem {
  desafioId: string;
  titulo: string;
  duracao?: string;
  paciente: { _id: string; user?: { nome?: string } };
  data_fim?: string;
  diasAtraso: number;
}

@Component({
  selector: 'app-psicologo-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class PsicologoDashboardComponent implements OnInit {
  auth = inject(AuthService);
  private psiSvc      = inject(PsicologoService);
  private consultaSvc = inject(ConsultaService);
  private desafioSvc  = inject(DesafioService);
  private qSvc        = inject(QuestionarioService);
  private chatSvc     = inject(ChatService);

  pacientes         = signal<PacienteComStats[]>([]);
  proximasConsultas = signal<Consulta[]>([]);
  desafiosPendentes = signal<Desafio[]>([]);
  loading           = signal(true);
  savingConsultaId  = signal<string | null>(null);

  /** Flattened list of (desafio, paciente) pairs that are still pending,
   *  sorted with the most overdue first. */
  desafiosPendentesDetalhe = computed<DesafioPendenteItem[]>(() => {
    const items: DesafioPendenteItem[] = [];
    for (const d of this.desafiosPendentes()) {
      // Ainda dentro do prazo, mas por cumprir
      for (const p of d.pacientesPendentes ?? []) {
        items.push({
          desafioId: d._id,
          titulo: d.titulo,
          duracao: d.duracao ?? d.tipo,
          paciente: p as { _id: string; user?: { nome?: string } },
          data_fim: d.data_fim ?? d.createdAt,
          diasAtraso: 0,
        });
      }
      // Prazo expirado e não cumprido
      for (const p of d.pacientesNaoCumpriram ?? []) {
        items.push({
          desafioId: d._id,
          titulo: d.titulo,
          duracao: d.duracao ?? d.tipo,
          paciente: p as { _id: string; user?: { nome?: string } },
          data_fim: d.data_fim ?? d.createdAt,
          diasAtraso: this.calcDiasAtraso(d.data_fim ?? d.createdAt),
        });
      }
    }
    return items.sort((a, b) => b.diasAtraso - a.diasAtraso);
  });

  /** Ids dos pacientes com pelo menos um desafio não cumprido há 3 ou mais dias. */
  private desafioAtraso3DiasIds = computed<Set<string>>(() => {
    const ids = new Set<string>();
    for (const item of this.desafiosPendentesDetalhe()) {
      if (item.diasAtraso >= 3) ids.add(item.paciente._id);
    }
    return ids;
  });

  /** Pacientes com humor 1 ou 2 recente, sem registo de humor há 3+ dias,
   *  ou com desafios não cumpridos há 3+ dias. */
  pacientesCriticos = computed<PacienteComStats[]>(() => {
    const atrasoIds = this.desafioAtraso3DiasIds();
    return this.pacientes()
      .filter(p => p.humorBaixo || p.semRegistoHumor3Dias || atrasoIds.has(p._id))
      .sort((a, b) => parseFloat(a.avgHumor ?? '5') - parseFloat(b.avgHumor ?? '5'));
  });

  ngOnInit(): void {
    this.psiSvc.getMyProfile().subscribe({
      next: profile => {
        const pacientesRaw = (profile?.pacientes ?? []) as PacienteComStats[];

        let remaining = pacientesRaw.length;
        if (!remaining) {
          this.pacientes.set([]);
          this.loading.set(false);
          return;
        }

        const enriched: PacienteComStats[] = pacientesRaw.map(p => ({ ...p }));

        enriched.forEach((p, i) => {
          this.qSvc.getQuestionariosByPaciente(p._id).subscribe({
            next: qs => {
              const sorted = qs
                .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
              const recent = sorted.slice(0, 7);
              if (recent.length) {
                const avg = recent.reduce((s, q) => s + q.humor, 0) / recent.length;
                enriched[i].avgHumor = avg.toFixed(1);
              }
              enriched[i].humorBaixo = recent.some(q => q.humor <= 2);

              const lastDate = sorted.length ? new Date(sorted[0].data) : null;
              enriched[i].semRegistoHumor3Dias = !lastDate
                || (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24) >= 3;
            },
            complete: () => {
              remaining--;
              if (remaining === 0) this.finalize(enriched);
            },
            error: () => {
              remaining--;
              if (remaining === 0) this.finalize(enriched);
            },
          });
        });
      },
      error: () => this.loading.set(false),
    });

    this.consultaSvc.getConsultasForPsicologo().subscribe({
      next: cs => {
        const now = new Date();
        const upcoming = cs
          .filter(c => c.estado !== 'cancelada' && c.estado !== 'realizada' && (new Date(c.data) >= now || this.isHoje(c.data)))
          .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
        this.proximasConsultas.set(upcoming);
      },
    });

    this.desafioSvc.getDesafiosByPsicologo().subscribe({
      next: ds => {
        const pending = ds.filter(d =>
          (d.pacientesPendentes && d.pacientesPendentes.length > 0) ||
          (d.pacientesNaoCumpriram && d.pacientesNaoCumpriram.length > 0)
        );
        this.desafiosPendentes.set(pending);
      },
    });
  }

  private calcDiasAtraso(dataFim?: string): number {
    if (!dataFim) return 0;
    const fim = new Date(dataFim);
    fim.setHours(23, 59, 59, 999);
    const now = new Date();
    if (now <= fim) return 0;
    return Math.floor((now.getTime() - fim.getTime()) / (1000 * 60 * 60 * 24));
  }

  abrirChat(pacienteId: string): void {
    this.chatSvc.openChatWithPaciente(pacienteId);
  }

  /** True if the consulta's date falls on today (local time). */
  isHoje(data: string): boolean {
    const d = new Date(data);
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth()
        && d.getDate() === now.getDate();
  }

  marcarRealizada(consulta: Consulta): void {
    if (this.savingConsultaId()) return;
    this.savingConsultaId.set(consulta._id);

    this.consultaSvc.updateConsulta(consulta._id, { estado: 'realizada' }).subscribe({
      next: updated => {
        this.proximasConsultas.update(list =>
          list.map(c => c._id === updated._id ? updated : c)
        );
        this.savingConsultaId.set(null);
      },
      error: () => {
        this.savingConsultaId.set(null);
      },
    });
  }

  private finalize(enriched: PacienteComStats[]): void {
    this.pacientes.set(enriched);
    this.loading.set(false);
  }
}
