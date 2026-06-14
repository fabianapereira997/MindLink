import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = 'http://localhost:8080/api';

export interface Mensagem {
  _id: string;
  paciente: string;
  psicologo: string;
  remetente: 'paciente' | 'psicologo';
  mensagem: string;
  replyTo?: string;
  data: string;
  createdAt: string;
  lida?: boolean;

  // Special popup message types (consulta scheduling)
  tipo?: 'texto' | 'consulta_pedido' | 'consulta_cancelada';
  consulta?: string;
  consultaData?: string;
  consultaDuracao?: number;
  resposta?: 'pendente' | 'confirmada' | 'rejeitada';
}

/** Paciente: { count }. Psicólogo: { [pacienteId]: count }. */
export type UnreadResponse = { count: number } | Record<string, number>;

@Injectable({ providedIn: 'root' })
export class MensagemService {
  constructor(private http: HttpClient) {}

  getConversa(pacienteId: string, psicologoId: string): Observable<Mensagem[]> {
    return this.http.get<Mensagem[]>(`${API}/mensagens/conversa/${pacienteId}/${psicologoId}`);
  }

  // Patient: just send {mensagem} — paciente/psicologo auto-filled from JWT
  sendAsPaciente(mensagem: string, replyTo?: string): Observable<Mensagem> {
    return this.http.post<Mensagem>(`${API}/mensagens`, { mensagem, ...(replyTo ? { replyTo } : {}) });
  }

  // Psychologist: must include paciente ID
  sendAsPsicologo(mensagem: string, pacienteId: string, replyTo?: string): Observable<Mensagem> {
    return this.http.post<Mensagem>(`${API}/mensagens`, { mensagem, paciente: pacienteId, ...(replyTo ? { replyTo } : {}) });
  }

  // Returns { count } for paciente, or { [pacienteId]: count } for psicólogo.
  getUnread(): Observable<UnreadResponse> {
    return this.http.get<UnreadResponse>(`${API}/mensagens/unread`);
  }

  // Marks all messages from the other party in this conversation as read.
  markAsRead(pacienteId: string, psicologoId: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${API}/mensagens/conversa/${pacienteId}/${psicologoId}/ler`, {});
  }

  // Patient: confirms/rejects a "consulta_pedido" popup.
  responderMensagem(id: string, resposta: 'confirmada' | 'rejeitada'): Observable<Mensagem> {
    return this.http.patch<Mensagem>(`${API}/mensagens/${id}/responder`, { resposta });
  }
}
