import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = 'http://localhost:8080/api';

export interface Consulta {
  _id: string;
  paciente: { _id: string; user?: { nome?: string } };
  psicologo: { _id: string; especialidade: string; user: { nome: string } };
  data: string;
  duracao: number;
  estado: 'agendada' | 'realizada' | 'cancelada';
  notas?: string;
}

@Injectable({ providedIn: 'root' })
export class ConsultaService {
  constructor(private http: HttpClient) {}

  getConsultasForPaciente(pacienteId: string): Observable<Consulta[]> {
    return this.http.get<Consulta[]>(`${API}/consultas/paciente/${pacienteId}`);
  }

  getConsultasForPsicologo(): Observable<Consulta[]> {
    return this.http.get<Consulta[]>(`${API}/consultas/psicologo`);
  }

  /** Admin: all consultas on the platform. */
  getAllConsultas(): Observable<Consulta[]> {
    return this.http.get<Consulta[]>(`${API}/consultas`);
  }

  deleteConsulta(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${API}/consultas/${id}`);
  }

  criarConsulta(payload: {
    paciente: string;
    data: string;
    duracao: number;
    notas?: string;
  }): Observable<Consulta> {
    return this.http.post<Consulta>(`${API}/consultas`, payload);
  }

  updateConsulta(id: string, payload: Partial<{
    data: string;
    duracao: number;
    estado: 'agendada' | 'realizada' | 'cancelada';
    notas: string;
  }>): Observable<Consulta> {
    return this.http.put<Consulta>(`${API}/consultas/${id}`, payload);
  }
}
