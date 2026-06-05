import {
  Component, inject, OnInit, OnDestroy, signal, computed,
  ElementRef, ViewChild, AfterViewChecked, HostListener,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { PacienteService, PacienteProfile } from '../../core/services/paciente.service';
import { MensagemService, Mensagem } from '../../core/services/mensagem.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesEl') messagesEl!: ElementRef<HTMLDivElement>;

  auth           = inject(AuthService);
  private pacSvc = inject(PacienteService);
  private msgSvc = inject(MensagemService);

  isOpen      = signal(false);
  fabBottom   = signal(24);
  hasUnread   = signal(false);   // red dot on FAB

  // Patient state
  pacienteProfile  = signal<PacienteProfile | null>(null);

  // Psychologist state
  pacientes        = signal<PacienteProfile[]>([]);
  selectedPaciente = signal<PacienteProfile | null>(null);
  // unread count per pacienteId for psychologist
  private unreadMap = new Map<string, number>();

  // Conversation
  mensagens    = signal<Mensagem[]>([]);
  sendError    = signal<string | null>(null);
  input        = new FormControl('', [Validators.required, Validators.minLength(1)]);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private bgPollTimer: ReturnType<typeof setInterval> | null = null;
  private footerObserver: IntersectionObserver | null = null;
  private shouldScrollBottom = false;
  private lastSeenCount = 0;  // messages seen when panel was last opened

  role = computed(() => this.auth.role());

  ngOnInit(): void {
    this.setupFooterObserver();

    if (this.role() === 'paciente') {
      this.pacSvc.getMyProfile().subscribe({
        next: profiles => {
          if (!profiles.length) return;
          const p = profiles[0];
          this.pacienteProfile.set(p);
          // Background poll to detect new messages even when panel is closed
          this.startBgPoll(p._id, p.psicologo._id);
        },
      });
    } else if (this.role() === 'psicologo') {
      this.pacSvc.getMyProfile().subscribe({
        next: pacientes => this.pacientes.set(pacientes),
      });
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.stopBgPoll();
    this.footerObserver?.disconnect();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
      this.shouldScrollBottom = false;
    }
  }

  // ── FAB ────────────────────────────────────────────────────────────────────

  toggleChat(): void {
    this.isOpen.update(v => !v);
    if (this.isOpen()) {
      this.hasUnread.set(false);
      this.openConversation();
    } else {
      this.stopPolling();
      // record last seen count so background poll knows what's "new"
      this.lastSeenCount = this.mensagens().length;
    }
  }

  private openConversation(): void {
    if (this.role() === 'paciente') {
      const p = this.pacienteProfile();
      if (p) {
        this.lastSeenCount = this.mensagens().length;
        this.loadAndPoll(p._id, p.psicologo._id);
      }
    } else if (this.role() === 'psicologo' && this.selectedPaciente()) {
      const sel = this.selectedPaciente()!;
      this.lastSeenCount = this.mensagens().length;
      this.loadAndPoll(sel._id, sel.psicologo._id);
    }
  }

  // ── Psychologist: select patient ───────────────────────────────────────────

  selectPaciente(p: PacienteProfile): void {
    this.selectedPaciente.set(p);
    this.mensagens.set([]);
    this.stopPolling();
    // Clear unread for this patient
    this.unreadMap.set(p._id, 0);
    this.refreshUnreadDot();
    this.loadAndPoll(p._id, p.psicologo._id);
  }

  hasUnreadForPaciente(p: PacienteProfile): boolean {
    return (this.unreadMap.get(p._id) ?? 0) > 0;
  }

  // ── Foreground polling (panel open) ────────────────────────────────────────

  private loadAndPoll(pacienteId: string, psicologoId: string): void {
    this.loadMessages(pacienteId, psicologoId, true);
    this.stopPolling();
    this.pollTimer = setInterval(() =>
      this.loadMessages(pacienteId, psicologoId, true), 5000);
  }

  private loadMessages(pacienteId: string, psicologoId: string, fromForeground: boolean): void {
    this.msgSvc.getConversa(pacienteId, psicologoId).subscribe({
      next: msgs => {
        const prev = this.mensagens().length;
        this.mensagens.set(msgs);
        if (msgs.length > prev) this.shouldScrollBottom = true;

        if (!fromForeground) {
          // Background: check for new messages
          if (msgs.length > this.lastSeenCount) {
            this.hasUnread.set(true);
          }
        } else {
          // Foreground (panel open): mark all as seen
          this.lastSeenCount = msgs.length;
        }
      },
    });
  }

  private stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  // ── Background polling (panel closed, patient only) ────────────────────────

  private startBgPoll(pacienteId: string, psicologoId: string): void {
    // Initial silent load to set baseline
    this.msgSvc.getConversa(pacienteId, psicologoId).subscribe({
      next: msgs => { this.lastSeenCount = msgs.length; },
    });
    this.bgPollTimer = setInterval(() => {
      if (!this.isOpen()) {
        this.loadMessages(pacienteId, psicologoId, false);
      }
    }, 10000); // every 10s in background
  }

  private stopBgPoll(): void {
    if (this.bgPollTimer) { clearInterval(this.bgPollTimer); this.bgPollTimer = null; }
  }

  // Psychologist: check if any patient has unread
  private refreshUnreadDot(): void {
    const anyUnread = Array.from(this.unreadMap.values()).some(v => v > 0);
    this.hasUnread.set(anyUnread);
  }

  // ── Send message ───────────────────────────────────────────────────────────

  send(): void {
    const text = (this.input.value ?? '').trim();
    if (!text) return;
    this.sendError.set(null);

    if (this.role() === 'paciente') {
      this.msgSvc.sendAsPaciente(text).subscribe({
        next: msg => {
          this.mensagens.update(m => [...m, msg]);
          this.lastSeenCount = this.mensagens().length;
          this.input.reset();
          this.shouldScrollBottom = true;
        },
        error: err => this.sendError.set(err.error?.error ?? 'Erro ao enviar.'),
      });
    } else if (this.role() === 'psicologo' && this.selectedPaciente()) {
      this.msgSvc.sendAsPsicologo(text, this.selectedPaciente()!._id).subscribe({
        next: msg => {
          this.mensagens.update(m => [...m, msg]);
          this.lastSeenCount = this.mensagens().length;
          this.input.reset();
          this.shouldScrollBottom = true;
        },
        error: err => this.sendError.set(err.error?.error ?? 'Erro ao enviar.'),
      });
    }
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private scrollToBottom(): void {
    const el = this.messagesEl?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  isMine(msg: Mensagem): boolean {
    return msg.remetente === this.role();
  }

  patientName(p: PacienteProfile): string {
    return p.user?.nome ?? 'Paciente';
  }

  psicologoName(): string {
    return this.pacienteProfile()?.psicologo?.user?.nome ?? 'Psicólogo';
  }

  // ── Footer avoidance ───────────────────────────────────────────────────────

  private setupFooterObserver(): void {
    const footer = document.querySelector('app-footer');
    if (!footer) return;
    this.footerObserver = new IntersectionObserver(entries => {
      const e = entries[0];
      this.fabBottom.set(e.isIntersecting ? e.intersectionRect.height + 24 : 24);
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    this.footerObserver.observe(footer);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.isOpen()) this.isOpen.set(false); }
}
