import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = 'http://localhost:8080/api';

export interface Consulta {
  _id: string;
  paciente: { _id: string };
  psicologo: { _id: string; especialidade: string; user: { nome: string } };
  data: string;
  duracao: number;
  estado: 'agendada' | 'concluida' | 'cancelada';
  notas?: string;
}

@Injectable({ providedIn: 'root' })
export class ConsultaService {
  constructor(private http: HttpClient) {}

  getConsultasForPaciente(pacienteId: string): Observable<Consulta[]> {
    return this.http.get<Consulta[]>(`${API}/consultas/paciente/${pacienteId}`);
  }
}
