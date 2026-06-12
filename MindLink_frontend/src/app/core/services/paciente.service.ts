import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = 'http://localhost:8080/api';

export interface PacienteProfile {
  _id: string;
  user: { _id: string; nome: string; email: string; genero: string; data_nascimento: string };
  psicologo: { _id: string; especialidade: string; user: { nome: string } };
  doenca: string;
  formulario: {
    historicoMedico: { comorbilidades: string[] };
    estiloDeVida: { exercicioRegular: boolean | null; fumador: boolean | null };
  };
  ativo?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PacienteService {
  constructor(private http: HttpClient) {}

  getMyProfile(): Observable<PacienteProfile[]> {
    return this.http.get<PacienteProfile[]>(`${API}/pacientes`);
  }

  criarPaciente(payload: {
    nome: string;
    email: string;
    password: string;
    genero: string;
    data_nascimento: string;
    doenca: string;
    formulario?: {
      historicoMedico?: { comorbilidades?: string[] };
      estiloDeVida?: { exercicioRegular?: boolean | null; fumador?: boolean | null };
    };
  }): Observable<PacienteProfile> {
    return this.http.post<PacienteProfile>(`${API}/pacientes`, payload);
  }

  eliminarPaciente(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${API}/pacientes/${id}`);
  }

  /** Paciente: update own estilo de vida (exercício regular / fumador). */
  updateEstiloVida(id: string, estiloDeVida: { exercicioRegular: boolean | null; fumador: boolean | null }): Observable<PacienteProfile> {
    return this.http.put<PacienteProfile>(`${API}/pacientes/${id}`, { formulario: { estiloDeVida } });
  }

  /** Exporta os dados completos de um paciente (perfil, formulário, registos, desafios, consultas) em XML. */
  exportarPaciente(id: string): Observable<Blob> {
    return this.http.get(`${API}/pacientes/${id}/export`, { responseType: 'blob' });
  }

  /** Psicólogo: exporta a lista resumida dos seus pacientes em XML. */
  exportarListaPacientes(): Observable<Blob> {
    return this.http.get(`${API}/pacientes/export/lista`, { responseType: 'blob' });
  }

  /** Psicólogo: termina o percurso de monitorização do paciente (torna-o inativo). */
  terminarMonitorizacao(id: string): Observable<PacienteProfile> {
    return this.http.put<PacienteProfile>(`${API}/pacientes/${id}`, { ativo: false });
  }
}
