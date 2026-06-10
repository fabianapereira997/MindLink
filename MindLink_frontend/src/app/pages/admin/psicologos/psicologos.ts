import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, AdminPsicologo } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-psicologos',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
  ],
  templateUrl: './psicologos.html',
  styleUrl: './psicologos.css',
})
export class AdminPsicologosComponent implements OnInit {
  private adminSvc = inject(AdminService);
  private fb       = inject(FormBuilder);

  psicologos  = signal<AdminPsicologo[]>([]);
  loading     = signal(true);
  error       = signal<string | null>(null);
  showModal   = signal(false);
  creating    = signal(false);
  createError = signal<string | null>(null);
  createDone  = signal(false);
  searchTerm         = signal('');
  filterEspecialidade = signal('');

  get especialidadeOptions(): string[] {
    const vals = this.psicologos()
      .map(p => p.especialidade?.trim())
      .filter((v): v is string => !!v)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
    return vals;
  }

  hidePassword = true;

  form = this.fb.group({
    nome:            ['', [Validators.required, Validators.minLength(2)]],
    email:           ['', [Validators.required, Validators.email]],
    password:        ['', [Validators.required, Validators.minLength(6)]],
    genero:          ['outro', Validators.required],
    data_nascimento: ['', Validators.required],
    especialidade:   [''],
  });

  get filtered() {
    const q   = this.searchTerm().toLowerCase();
    const esp = this.filterEspecialidade();
    return this.psicologos().filter(p => {
      const matchQ   = !q || p.user.nome.toLowerCase().includes(q) || p.user.email.toLowerCase().includes(q);
      const matchEsp = !esp || (p.especialidade ?? '') === esp;
      return matchQ && matchEsp;
    });
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.adminSvc.getPsicologos().subscribe({
      next: list => { this.psicologos.set(list); this.loading.set(false); },
      error: err => { this.error.set(err.error?.error ?? 'Erro ao carregar.'); this.loading.set(false); },
    });
  }

  openModal(): void {
    this.form.reset({ genero: 'outro' });
    this.createError.set(null);
    this.createDone.set(false);
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  submit(): void {
    if (this.form.invalid) return;
    this.creating.set(true);
    this.createError.set(null);
    const { nome, email, password, genero, data_nascimento, especialidade } = this.form.value;
    this.adminSvc.createPsicologo({ nome: nome!, email: email!, password: password!, genero: genero!, data_nascimento: data_nascimento!, especialidade: especialidade ?? '' }).subscribe({
      next: () => {
        this.creating.set(false);
        this.createDone.set(true);
        this.showModal.set(false);
        this.load();
      },
      error: err => {
        this.creating.set(false);
        this.createError.set(err.error?.error ?? 'Erro ao criar psicólogo.');
      },
    });
  }

  delete(id: string, nome: string): void {
    if (!confirm(`Remover o psicólogo ${nome}? Esta ação é irreversível.`)) return;
    this.adminSvc.deletePsicologo(id).subscribe({
      next: () => this.load(),
      error: err => alert(err.error?.error ?? 'Erro ao remover.'),
    });
  }
}
