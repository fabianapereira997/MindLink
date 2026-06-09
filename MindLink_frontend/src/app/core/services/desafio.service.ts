import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = 'http://localhost:8080/api';

export interface Desafio {
  _id: string;
  titulo: string;
  descricao?: string;
  duracao?: 'diario' | 'semanal' | 'mensal';
  pacientesCumpriram?: { _id: string; user?: { nome?: string } }[];
  pacientesNaoCumpriram?: { _id: string; user?: { nome?: string } }[];
  // campos do paciente
  paciente?: { _id: string };
  psicologo?: { _id: string; user: { nome: string } };
  tipo?: 'diario' | 'semanal' | 'mensal';
  data_inicio?: string;
  data_fim?: string;
  estado?: 'pendente' | 'concluido' | 'cancelado';
  sugestao?: string;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class DesafioService {
  constructor(private http: HttpClient) {}

  getDesafiosForPaciente(pacienteId: string): Observable<Desafio[]> {
    return this.http.get<Desafio[]>(`${API}/desafios/paciente/${pacienteId}`);
  }

  marcarConcluido(desafioId: string): Observable<Desafio> {
    return this.http.patch<Desafio>(`${API}/desafios/${desafioId}/estado`, { estado: 'concluido' });
  }

  getDesafiosByPsicologo(): Observable<Desafio[]> {
    return this.http.get<Desafio[]>(`${API}/desafios/psicologo`);
  }

  criarDesafio(payload: {
    titulo: string;
    descricao?: string;
    duracao: 'diario' | 'semanal' | 'mensal';
    pacientes: string[];
  }): Observable<Desafio> {
    return this.http.post<Desafio>(`${API}/desafios`, payload);
  }
}
