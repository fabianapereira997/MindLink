import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PsicologoService } from '../../core/services/psicologo.service';
import { QuestionarioService } from '../../core/services/questionario.service';

export interface PacienteRow {
  _id: string;
  user?: { nome?: string; email?: string };
  avgHumor?: string;
}

@Component({
  selector: 'app-psicologo-pacientes',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './pacientes.html',
  styleUrl: './pacientes.css',
})
export class PsicologoPacientesComponent implements OnInit {
  private psiSvc = inject(PsicologoService);
  private qSvc   = inject(QuestionarioService);

  pacientes = signal<PacienteRow[]>([]);
  loading   = signal(true);
  search    = signal('');

  filtered = computed(() => {
    const s = this.search().toLowerCase();
    if (!s) return this.pacientes();
    return this.pacientes().filter(p =>
      (p.user?.nome ?? '').toLowerCase().includes(s) ||
      (p.user?.email ?? '').toLowerCase().includes(s)
    );
  });

  ngOnInit(): void {
    this.psiSvc.getMyProfile().subscribe({
      next: profile => {
        const raw = (profile?.pacientes ?? []) as PacienteRow[];
        let remaining = raw.length;
        if (!remaining) { this.pacientes.set([]); this.loading.set(false); return; }

        const enriched: PacienteRow[] = raw.map(p => ({ ...p }));
        enriched.forEach((p, i) => {
          this.qSvc.getQuestionariosByPaciente(p._id).subscribe({
            next: qs => {
              const recent = qs
                .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
                .slice(0, 7);
              if (recent.length) {
                enriched[i].avgHumor = (recent.reduce((s, q) => s + q.humor, 0) / recent.length).toFixed(1);
              }
            },
            complete: () => { remaining--; if (!remaining) { this.pacientes.set(enriched); this.loading.set(false); } },
            error:    () => { remaining--; if (!remaining) { this.pacientes.set(enriched); this.loading.set(false); } },
          });
        });
      },
      error: () => this.loading.set(false),
    });
  }

  humorClass(avg: string): string {
    const v = parseFloat(avg);
    if (v <= 2) return 'humor-pill--low';
    if (v <= 3.5) return 'humor-pill--mid';
    return 'humor-pill--ok';
  }
}
