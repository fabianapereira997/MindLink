import { Injectable, signal } from '@angular/core';

/**
 * Lightweight bridge that lets any component (e.g. the psicólogo dashboard)
 * request the global chat panel to open and jump straight to the
 * conversation with a specific paciente.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  /** pacienteId the chat panel should open/select, or null when idle */
  requestedPacienteId = signal<string | null>(null);

  /** Text of a comment/answer the psicólogo wants to reply to, if any */
  requestedReplyText = signal<string | null>(null);

  openChatWithPaciente(pacienteId: string, replyTo?: string): void {
    this.requestedPacienteId.set(pacienteId);
    this.requestedReplyText.set(replyTo ?? null);
  }

  clearRequest(): void {
    this.requestedPacienteId.set(null);
    this.requestedReplyText.set(null);
  }
}
