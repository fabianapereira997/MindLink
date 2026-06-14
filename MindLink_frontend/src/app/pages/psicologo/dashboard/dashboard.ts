import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { PsicologoService, PsicologoProfile } from '../../../core/services/psicologo.service';
import { ConsultaService, Consulta } from '../../../core/services/consulta.service';
import { DesafioService, Desafio } from '../../../core/services/desafio.service';
import { QuestionarioService, Questionario } from '../../../core/services/questionario.service';
import { ChatService } from '../../../core/services/chat.service';
import { QUESTIONARIO_GRUPOS } from '../../../core/constants/questionario-perguntas';

export interface PacienteComStats {
  _id: string;
  user?: { nome?: string };
  avgHumor?: string;
  humorBaixo?: boolean;
  semRegistoHumor3Dias?: boolean;
  /** Último registo de humor (questionário) submetido por este paciente, se existir. */
  ultimoQuestionario?: Questionario;
  /** Verdadeiro se o último registo de humor foi submetido hoje. */
  respondidoHoje?: boolean;
  /** Data de associação do paciente (criação do registo), usada para estatísticas. */
  createdAt?: string;
  /** Variação do humor médio dos últimos 7 dias face aos 7 dias anteriores (positivo = melhorou). */
  tendenciaHumor?: number;
}

export interface DesafioPendenteItem {
  desafioId: string;
  titulo: string;
  descricao?: string;
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

  /** Paciente cujo registo de humor está a ser visualizado no pop-up, ou null se fechado. */
  humorModal = signal<PacienteComStats | null>(null);

  // Constantes/helpers usados no template do pop-up de registo de humor
  readonly QUESTIONARIO_GRUPOS = QUESTIONARIO_GRUPOS;
  private readonly HUMOR_COLORS = ['', '#dc2626', '#f97316', '#eab308', '#73C883', '#26874E'];
  private readonly HUMOR_LABELS = ['', 'Muito mau', 'Mau', 'Razoável', 'Bom', 'Muito bom'];

  /** Cor associada ao humor (1-5) do último questionário respondido pelo paciente. */
  humorCorFor(p: PacienteComStats): string {
    const q = p.ultimoQuestionario;
    return q ? this.HUMOR_COLORS[q.humor] : '';
  }

  humorModalColor = computed(() => {
    const q = this.humorModal()?.ultimoQuestionario;
    return q ? this.HUMOR_COLORS[q.humor] : '';
  });

  humorModalLabel = computed(() => {
    const q = this.humorModal()?.ultimoQuestionario;
    return q ? this.HUMOR_LABELS[q.humor] : '';
  });

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
          descricao: d.descricao,
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
          descricao: d.descricao,
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
  desafioAtraso3DiasIds = computed<Set<string>>(() => {
    const ids = new Set<string>();
    for (const item of this.desafiosPendentesDetalhe()) {
      if (item.diasAtraso >= 3) ids.add(item.paciente._id);
    }
    return ids;
  });

  /** Número de pacientes associados durante o mês atual. */
  novosPacientesEsteMes = computed<number>(() => {
    const now = new Date();
    return this.pacientes().filter(p => {
      if (!p.createdAt) return false;
      const d = new Date(p.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
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

                const previous = sorted.slice(7, 14);
                if (previous.length) {
                  const avgPrevious = previous.reduce((s, q) => s + q.humor, 0) / previous.length;
                  enriched[i].tendenciaHumor = avg - avgPrevious;
                }
              }
              enriched[i].humorBaixo = recent.some(q => q.humor <= 2);

              const lastDate = sorted.length ? new Date(sorted[0].data) : null;
              enriched[i].semRegistoHumor3Dias = !lastDate
                || (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24) >= 3;

              enriched[i].ultimoQuestionario = sorted[0];
              enriched[i].respondidoHoje = !!lastDate && this.isHoje(sorted[0].data);
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

  /** Texto a explicar porque é que o paciente está em monitorização prioritária. */
  motivoAtencao(p: PacienteComStats): string {
    if (p.humorBaixo) return 'Humor médio recente abaixo do esperado';
    if (p.semRegistoHumor3Dias) return 'Sem registo de humor há 3 ou mais dias';
    if (this.desafioAtraso3DiasIds().has(p._id)) return 'Desafio não cumprido há 3 ou mais dias';
    return '';
  }

  /** Texto descritivo da tendência do humor nos últimos 7 dias, ou null se não houver dados suficientes. */
  tendenciaHumorTexto(p: PacienteComStats): string | null {
    const t = p.tendenciaHumor;
    if (t === undefined || t === null) return null;
    const valor = Math.abs(t).toFixed(1).replace('.', ',');
    if (t <= -0.05) return `Diminuiu ${valor} pontos nos últimos 7 dias`;
    if (t >= 0.05) return `Aumentou ${valor} pontos nos últimos 7 dias`;
    return 'Manteve-se estável nos últimos 7 dias';
  }

  /** Seta indicativa da tendência (↓, ↑ ou →). */
  tendenciaHumorSeta(p: PacienteComStats): string {
    const t = p.tendenciaHumor;
    if (t === undefined || t === null) return '';
    if (t <= -0.05) return '↓';
    if (t >= 0.05) return '↑';
    return '→';
  }

  /** Ids dos desafios (combinação desafio+paciente) atualmente expandidos no dashboard. */
  desafiosExpandidos = signal<Set<string>>(new Set());

  toggleDesafioExpandido(key: string): void {
    this.desafiosExpandidos.update(set => {
      const novo = new Set(set);
      if (novo.has(key)) novo.delete(key);
      else novo.add(key);
      return novo;
    });
  }

  /** Abre o pop-up com o registo de humor respondido pelo paciente. */
  abrirHumorModal(p: PacienteComStats): void {
    if (!p.ultimoQuestionario) return;
    this.humorModal.set(p);
  }

  fecharHumorModal(): void {
    this.humorModal.set(null);
  }

  /** Envia uma mensagem ao paciente, como reply ao registo de humor visualizado. */
  enviarMensagemHumor(): void {
    const p = this.humorModal();
    const q = p?.ultimoQuestionario;
    if (!p || !q) return;

    const dataStr = this.formatDataPtBr(q.data);
    let replyTo = `Questionário ${dataStr}`;
    if (q.notas) {
      replyTo += `\n${q.notas}`;
    }
    this.chatSvc.openChatWithPaciente(p._id, replyTo);
    this.fecharHumorModal();
  }

  private formatDataPtBr(data: string): string {
    const d = new Date(data);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
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
