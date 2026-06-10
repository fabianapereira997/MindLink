import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DesafioService, Desafio } from '../../../core/services/desafio.service';
import { PsicologoService } from '../../../core/services/psicologo.service';

interface PacienteBasic {
  _id: string;
  user?: { nome?: string };
}

@Component({
  selector: 'app-psicologo-desafios',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './desafios.html',
  styleUrl: './desafios.css',
})
export class PsicologoDesafiosComponent implements OnInit {
  private desafioSvc = inject(DesafioService);
  private psiSvc     = inject(PsicologoService);

  desafios          = signal<Desafio[]>([]);
  pacientes         = signal<PacienteBasic[]>([]);
  loading           = signal(true);
  showForm          = signal(false);
  saving            = signal(false);
  formError         = signal<string | null>(null);
  formSuccess       = signal(false);

  novoTitulo        = signal('');
  novaDescricao     = signal('');
  novaDuracao       = signal<'diario' | 'semanal' | 'mensal'>('diario');
  selectedPacientes = signal<string[]>([]);

  ngOnInit(): void {
    this.desafioSvc.getDesafiosByPsicologo().subscribe({
      next: ds => { this.desafios.set(ds); this.loading.set(false); },
      error: () => this.loading.set(false),
    });

    this.psiSvc.getMyProfile().subscribe({
      next: profile => this.pacientes.set((profile?.pacientes ?? []) as PacienteBasic[]),
    });
  }

  togglePaciente(id: string): void {
    const curr = this.selectedPacientes();
    if (curr.includes(id)) {
      this.selectedPacientes.set(curr.filter(x => x !== id));
    } else {
      this.selectedPacientes.set([...curr, id]);
    }
  }

  criarDesafio(): void {
    this.formError.set(null);
    this.formSuccess.set(false);

    if (!this.novoTitulo().trim()) {
      this.formError.set('O título é obrigatório.');
      return;
    }
    if (!this.selectedPacientes().length) {
      this.formError.set('Selecione pelo menos um paciente.');
      return;
    }

    this.saving.set(true);
    this.desafioSvc.criarDesafio({
      titulo:    this.novoTitulo(),
      descricao: this.novaDescricao(),
      duracao:   this.novaDuracao(),
      pacientes: this.selectedPacientes(),
    }).subscribe({
      next: d => {
        this.desafios.set([d, ...this.desafios()]);
        this.formSuccess.set(true);
        this.novoTitulo.set('');
        this.novaDescricao.set('');
        this.novaDuracao.set('diario');
        this.selectedPacientes.set([]);
        this.saving.set(false);
        setTimeout(() => { this.showForm.set(false); this.formSuccess.set(false); }, 1500);
      },
      error: () => {
        this.formError.set('Erro ao criar o desafio. Tente novamente.');
        this.saving.set(false);
      },
    });
  }
}
