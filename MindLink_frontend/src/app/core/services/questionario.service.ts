import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = 'http://localhost:8080/api';

export interface Questionario {
  _id: string;
  paciente: string;
  data: string;
  humor: number;   // 1–5
  sintomas?: string[] | string;
  notas?: string;
  /** Respostas adicionais (perguntas q1..q14), cada uma numa escala de 1-5 */
  respostas?: Record<string, number>;
}

export interface QuestionarioCreate {
  data: string;
  humor: number;
  sintomas?: string[];
  notas?: string;
  respostas?: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class QuestionarioService {
  constructor(private http: HttpClient) {}

  getMyQuestionarios(): Observable<Questionario[]> {
    return this.http.get<Questionario[]>(`${API}/questionarios`);
  }

  create(data: QuestionarioCreate): Observable<Questionario> {
    return this.http.post<Questionario>(`${API}/questionarios`, data);
  }

  getQuestionariosByPaciente(pacienteId: string): Observable<Questionario[]> {
    return this.http.get<Questionario[]>(`${API}/questionarios/paciente/${pacienteId}`);
  }
}
