import {
  Component, inject, OnInit, OnDestroy, signal, computed, effect,
  ElementRef, ViewChild, AfterViewChecked, HostListener,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PacienteService, PacienteProfile } from '../../core/services/paciente.service';
import { MensagemService, Mensagem } from '../../core/services/mensagem.service';
import { ChatService } from '../../core/services/chat.service';

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
  private pacSvc  = inject(PacienteService);
  private msgSvc  = inject(MensagemService);
  private chatSvc = inject(ChatService);
  private router  = inject(Router);

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
  /** Text of the comment/answer being replied to (shown as a preview above the input) */
  replyContext = signal<string | null>(null);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private unreadPollTimer: ReturnType<typeof setInterval> | null = null;
  private footerObserver: IntersectionObserver | null = null;
  private shouldScrollBottom = false;

  role = computed(() => this.auth.role());
  private initializedForRole: string | null = null;

  constructor() {
    // Allow other components (e.g. psicólogo dashboard) to request opening
    // the chat panel directly on a specific paciente's conversation.
    effect(() => {
      const pacienteId = this.chatSvc.requestedPacienteId();
      if (!pacienteId || this.role() !== 'psicologo') return;

      const found = this.pacientes().find(p => p._id === pacienteId);
      if (found) {
        this.isOpen.set(true);
        this.hasUnread.set(false);
        this.selectPaciente(found);
        this.replyContext.set(this.chatSvc.requestedReplyText());
        this.chatSvc.clearRequest();
      }
    });

    // Re-initialize whenever the logged-in role changes (e.g. login without a
    // full page refresh), and reset state on logout.
    effect(() => {
      const r = this.role();

      if (r === 'paciente' || r === 'psicologo') {
        if (this.initializedForRole !== r) {
          this.initializedForRole = r;
          this.initForRole(r);
        }
      } else if (this.initializedForRole !== null) {
        this.initializedForRole = null;
        this.resetState();
      }
    });
  }

  ngOnInit(): void {
    this.setupFooterObserver();
  }

  private initForRole(role: 'paciente' | 'psicologo'): void {
    if (role === 'paciente') {
      this.pacSvc.getMyProfile().subscribe({
        next: profiles => {
          if (!profiles.length) return;
          const p = profiles[0];
          this.pacienteProfile.set(p);
          this.startUnreadPoll();
        },
        error: err => console.error('Erro ao carregar perfil do paciente (chat)', err),
      });
    } else {
      this.pacSvc.getMyProfile().subscribe({
        next: pacientes => {
          this.pacientes.set(pacientes);
          this.startUnreadPoll();
        },
        error: err => console.error('Erro ao carregar pacientes (chat)', err),
      });
    }
  }

  private resetState(): void {
    this.stopPolling();
    this.stopUnreadPoll();
    this.isOpen.set(false);
    this.hasUnread.set(false);
    this.unreadMap.clear();
    this.pacienteProfile.set(null);
    this.pacientes.set([]);
    this.selectedPaciente.set(null);
    this.mensagens.set([]);
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.stopUnreadPoll();
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
      if (this.role() === 'paciente') this.hasUnread.set(false);
      this.shouldScrollBottom = true;
      this.openConversation();
    } else {
      this.stopPolling();
    }
  }

  private openConversation(): void {
    if (this.role() === 'paciente') {
      const p = this.pacienteProfile();
      if (p) {
        this.loadAndPoll(p._id, p.psicologo._id);
        this.markConversationRead(p._id, p.psicologo._id);
      }
    } else if (this.role() === 'psicologo' && this.selectedPaciente()) {
      const sel = this.selectedPaciente()!;
      this.loadAndPoll(sel._id, sel.psicologo._id);
      this.markConversationRead(sel._id, sel.psicologo._id);
    }
  }

  // ── Psychologist: select patient ───────────────────────────────────────────

  selectPaciente(p: PacienteProfile): void {
    this.selectedPaciente.set(p);
    this.mensagens.set([]);
    this.replyContext.set(null);
    this.stopPolling();
    // Clear unread for this patient
    this.unreadMap.set(p._id, 0);
    this.refreshUnreadDot();
    this.shouldScrollBottom = true;
    this.loadAndPoll(p._id, p.psicologo._id);
    this.markConversationRead(p._id, p.psicologo._id);
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
        if (msgs.length > prev) {
          this.shouldScrollBottom = true;
          // New messages arrived while the conversation is open — mark them read.
          if (fromForeground) this.markConversationRead(pacienteId, psicologoId);
        }

        if (fromForeground) {
          this.sendError.set(null);
        }
      },
      error: err => {
        if (fromForeground) {
          this.sendError.set(
            err.status === 401 ? 'Sessão expirada. A redirecionar...'
            : `Erro ao carregar mensagens (${err.status ?? 'sem ligação'}).`
          );
        }
      },
    });
  }

  private stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  // ── Unread polling (drives FAB dot + per-patient highlight) ────────────────

  private startUnreadPoll(): void {
    this.refreshUnread();
    this.unreadPollTimer = setInterval(() => this.refreshUnread(), 10000);
  }

  private stopUnreadPoll(): void {
    if (this.unreadPollTimer) { clearInterval(this.unreadPollTimer); this.unreadPollTimer = null; }
  }

  private refreshUnread(): void {
    this.msgSvc.getUnread().subscribe({
      next: res => {
        if (this.role() === 'paciente') {
          const count = (res as { count: number }).count ?? 0;
          if (this.isOpen()) {
            // Conversation is open — anything new is read immediately.
            this.hasUnread.set(false);
            const p = this.pacienteProfile();
            if (count > 0 && p) this.markConversationRead(p._id, p.psicologo._id);
          } else {
            this.hasUnread.set(count > 0);
          }
        } else if (this.role() === 'psicologo') {
          this.unreadMap = new Map(Object.entries(res as Record<string, number>));
          // The currently open conversation is always considered read.
          const sel = this.selectedPaciente();
          if (this.isOpen() && sel) {
            if ((this.unreadMap.get(sel._id) ?? 0) > 0) {
              this.markConversationRead(sel._id, sel.psicologo._id);
            }
            this.unreadMap.set(sel._id, 0);
          }
          this.refreshUnreadDot();
        }
      },
      error: () => { /* silently ignore — non-critical */ },
    });
  }

  // Psychologist: check if any patient has unread
  private refreshUnreadDot(): void {
    const anyUnread = Array.from(this.unreadMap.values()).some(v => v > 0);
    this.hasUnread.set(anyUnread);
  }

  private markConversationRead(pacienteId: string, psicologoId: string): void {
    this.msgSvc.markAsRead(pacienteId, psicologoId).subscribe({
      error: () => { /* silently ignore — non-critical */ },
    });
  }

  // ── Send message ───────────────────────────────────────────────────────────

  send(): void {
    const text = (this.input.value ?? '').trim();
    if (!text) return;
    this.sendError.set(null);
    const replyTo = this.replyContext() ?? undefined;

    if (this.role() === 'paciente') {
      this.msgSvc.sendAsPaciente(text, replyTo).subscribe({
        next: msg => {
          this.mensagens.update(m => [...m, msg]);
          this.input.reset();
          this.replyContext.set(null);
          this.shouldScrollBottom = true;
        },
        error: err => this.sendError.set(err.error?.error ?? 'Erro ao enviar.'),
      });
    } else if (this.role() === 'psicologo' && this.selectedPaciente()) {
      this.msgSvc.sendAsPsicologo(text, this.selectedPaciente()!._id, replyTo).subscribe({
        next: msg => {
          this.mensagens.update(m => [...m, msg]);
          this.input.reset();
          this.replyContext.set(null);
          this.shouldScrollBottom = true;
        },
        error: err => this.sendError.set(err.error?.error ?? 'Erro ao enviar.'),
      });
    }
  }

  cancelReply(): void {
    this.replyContext.set(null);
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }

  // ── Consulta popup responses ───────────────────────────────────────────────

  // Patient confirms/rejects a "consulta_pedido" popup.
  responderConsultaPedido(msg: Mensagem, resposta: 'confirmada' | 'rejeitada'): void {
    this.msgSvc.responderMensagem(msg._id, resposta).subscribe({
      next: updated => {
        this.mensagens.update(list => list.map(m => m._id === updated._id ? updated : m));
        this.shouldScrollBottom = true;
        this.refreshCurrentConversation();
      },
      error: err => this.sendError.set(err.error?.error ?? 'Erro ao responder.'),
    });
  }

  private refreshCurrentConversation(): void {
    if (this.role() === 'paciente') {
      const p = this.pacienteProfile();
      if (p) this.loadMessages(p._id, p.psicologo._id, true);
    } else if (this.role() === 'psicologo' && this.selectedPaciente()) {
      const sel = this.selectedPaciente()!;
      this.loadMessages(sel._id, sel.psicologo._id, true);
    }
  }

  // ── Navigate to agenda showing the consulta's date ─────────────────────────

  verNaAgenda(msg: Mensagem): void {
    if (!msg.consultaData) return;
    const target = this.role() === 'paciente' ? '/paciente/agenda' : '/psicologo/agenda';
    this.router.navigate([target], { queryParams: { data: msg.consultaData } });
    this.isOpen.set(false);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private scrollToBottom(): void {
    const el = this.messagesEl?.nativeElement;
    if (!el) return;
    // Wait for layout to settle (new message rows may not have their final
    // height yet at the point ngAfterViewChecked fires) before measuring.
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
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
