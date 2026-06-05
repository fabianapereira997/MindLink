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
  data: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class MensagemService {
  constructor(private http: HttpClient) {}

  getConversa(pacienteId: string, psicologoId: string): Observable<Mensagem[]> {
    return this.http.get<Mensagem[]>(`${API}/mensagens/conversa/${pacienteId}/${psicologoId}`);
  }

  // Patient: just send {mensagem} — paciente/psicologo auto-filled from JWT
  sendAsPaciente(mensagem: string): Observable<Mensagem> {
    return this.http.post<Mensagem>(`${API}/mensagens`, { mensagem });
  }

  // Psychologist: must include paciente ID
  sendAsPsicologo(mensagem: string, pacienteId: string): Observable<Mensagem> {
    return this.http.post<Mensagem>(`${API}/mensagens`, { mensagem, paciente: pacienteId });
  }
}
