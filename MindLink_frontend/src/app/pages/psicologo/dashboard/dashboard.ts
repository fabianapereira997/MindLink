import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PsicologoService, PsicologoProfile } from '../../core/services/psicologo.service';
import { ConsultaService, Consulta } from '../../core/services/consulta.service';
import { DesafioService, Desafio } from '../../core/services/desafio.service';
import { QuestionarioService } from '../../core/services/questionario.service';

export interface PacienteComStats {
  _id: string;
  user?: { nome?: string };
  avgHumor?: string;
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

  pacientes         = signal<PacienteComStats[]>([]);
  pacientesCriticos = signal<PacienteComStats[]>([]);
  proximasConsultas = signal<Consulta[]>([]);
  desafiosPendentes = signal<Desafio[]>([]);
  loading           = signal(true);

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
              const recent = qs
                .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
                .slice(0, 7);
              if (recent.length) {
                const avg = recent.reduce((s, q) => s + q.humor, 0) / recent.length;
                enriched[i].avgHumor = avg.toFixed(1);
              }
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
          .filter(c => new Date(c.data) >= now && c.estado !== 'cancelada')
          .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
        this.proximasConsultas.set(upcoming);
      },
    });

    this.desafioSvc.getDesafiosByPsicologo().subscribe({
      next: ds => {
        const pending = ds.filter(d =>
          d.pacientesNaoCumpriram && d.pacientesNaoCumpriram.length > 0
        );
        this.desafiosPendentes.set(pending);
      },
    });
  }

  private finalize(enriched: PacienteComStats[]): void {
    this.pacientes.set(enriched);
    const criticos = enriched
      .filter(p => p.avgHumor && parseFloat(p.avgHumor) <= 2.5)
      .sort((a, b) => parseFloat(a.avgHumor ?? '5') - parseFloat(b.avgHumor ?? '5'));
    this.pacientesCriticos.set(criticos);
    this.loading.set(false);
  }
}
