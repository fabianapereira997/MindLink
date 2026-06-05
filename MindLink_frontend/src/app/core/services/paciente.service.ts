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
}

@Injectable({ providedIn: 'root' })
export class PacienteService {
  constructor(private http: HttpClient) {}

  getMyProfile(): Observable<PacienteProfile[]> {
    return this.http.get<PacienteProfile[]>(`${API}/pacientes`);
  }
}
