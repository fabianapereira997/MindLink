import { Component, inject, OnInit, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AdminService, AdminPsicologo } from '../../../core/services/admin.service';
import { todayDateString, minBirthDateString } from '../../../core/utils/date.utils';

@Component({
  selector: 'app-admin-psicologos',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
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
  success     = signal<string | null>(null);
  showModal   = signal(false);
  creating    = signal(false);
  createError = signal<string | null>(null);
  createDone  = signal(false);
  searchTerm         = signal('');
  filterEspecialidade = signal('');

  confirmInativarTarget = signal<AdminPsicologo | null>(null);

  /** Id do psicólogo cujo menu de ações (⋯) está aberto, ou null se nenhum estiver. */
  menuAbertoId = signal<string | null>(null);

  /** Today's date ('YYYY-MM-DD'); data de nascimento cannot be later than this. */
  readonly maxBirthDate = todayDateString();
  /** Earliest allowed birth date ('YYYY-MM-DD'); age cannot exceed 120 years. */
  readonly minBirthDate = minBirthDateString();

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
    password:        ['', [Validators.required, Validators.minLength(6), Validators.pattern(/.*[0-9].*/)]],
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

  /** Gera uma password aleatória (mín. 8 caracteres, incluindo um número) e
   *  preenche o campo, tornando-a visível para o administrador a transmitir. */
  gerarPassword(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!/[0-9]/.test(pwd)) {
      pwd = pwd.slice(0, -1) + Math.floor(Math.random() * 10);
    }
    this.form.patchValue({ password: pwd });
    this.hidePassword = false;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.createError.set('Existem campos inválidos ou em falta. Verifique os campos assinalados.');
      return;
    }
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

  toggleAtivo(p: AdminPsicologo): void {
    const novoEstado = !(p.ativo ?? true);
    if (novoEstado === false) {
      this.confirmInativarTarget.set(p);
      return;
    }
    this.applyAtivo(p, novoEstado);
  }

  cancelInativar(): void {
    this.confirmInativarTarget.set(null);
  }

  confirmInativar(): void {
    const p = this.confirmInativarTarget();
    if (!p) return;
    this.confirmInativarTarget.set(null);
    this.applyAtivo(p, false);
  }

  private applyAtivo(p: AdminPsicologo, novoEstado: boolean): void {
    this.error.set(null);
    this.success.set(null);
    this.adminSvc.setPsicologoAtivo(p._id, novoEstado).subscribe({
      next: updated => {
        this.psicologos.update(list => list.map(x => x._id === updated._id ? { ...x, ativo: updated.ativo } : x));
        this.success.set(novoEstado ? 'Psicólogo ativado com sucesso.' : 'Psicólogo inativado com sucesso.');
      },
      error: err => this.error.set(err.error?.error ?? 'Erro ao atualizar o estado do psicólogo.'),
    });
  }

  // ── Menu de ações (⋯) ────────────────────────────────────────────────────────
  toggleMenu(id: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuAbertoId.set(this.menuAbertoId() === id ? null : id);
  }

  @HostListener('document:click')
  fecharMenu(): void {
    this.menuAbertoId.set(null);
  }

}
