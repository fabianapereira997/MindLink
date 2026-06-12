import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = 'http://localhost:8080/api/admin';

export interface AdminStats {
  totals: {
    psicologos: number;
    pacientes: number;
    consultas: number;
    realizadas: number;
    questionarios: number;
  };
  patientsByPsicologo: { psicologoId: string; nome: string; count: number }[];
  consultasByPsicologo: {
    psicologoId: string; nome: string;
    total: number; realizadas: number; agendadas: number; canceladas: number;
  }[];
  moodByPsicologo: { psicologoId: string; nome: string; avgMood: string | null; checks: number }[];
  inactivePatients: { _id: string; nome: string; psicologo: string }[];
  upcoming: any[];
}

export interface AdminPsicologo {
  _id: string;
  especialidade: string;
  patientCount?: number;
  ativo?: boolean;
  user: { _id: string; nome: string; email: string; genero: string; data_nascimento: string };
}

export interface AdminPaciente {
  _id: string;
  doenca?: string;
  user: { _id: string; nome: string; email: string; genero: string; data_nascimento: string };
  psicologo?: { _id: string; especialidade: string; user: { nome: string; email: string } };
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  getStats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${API}/stats`);
  }

  // ── Psicólogos ──────────────────────────────────────────────────────────────
  getPsicologos(): Observable<AdminPsicologo[]> {
    return this.http.get<AdminPsicologo[]>(`${API}/psicologos`);
  }

  getPsicologoDetalhe(id: string): Observable<{ psicologo: AdminPsicologo; pacientes: AdminPaciente[]; consultas: any[] }> {
    return this.http.get<any>(`${API}/psicologos/${id}`);
  }

  createPsicologo(data: {
    nome: string; email: string; password: string;
    genero: string; data_nascimento: string; especialidade: string;
  }): Observable<AdminPsicologo> {
    return this.http.post<AdminPsicologo>(`${API}/psicologos`, data);
  }

  deletePsicologo(id: string): Observable<any> {
    return this.http.delete(`${API}/psicologos/${id}`);
  }

  setPsicologoAtivo(id: string, ativo: boolean): Observable<AdminPsicologo> {
    return this.http.put<AdminPsicologo>(`${API}/psicologos/${id}/ativo`, { ativo });
  }

  exportPacientesXml(psicologoId: string): Observable<Blob> {
    return this.http.get(`${API}/psicologos/${psicologoId}/export-pacientes`, { responseType: 'blob' });
  }

  importPacientesXml(psicologoId: string, xml: string): Observable<{ message: string; total: number; atualizados: number }> {
    return this.http.post<{ message: string; total: number; atualizados: number }>(
      `${API}/psicologos/${psicologoId}/import-pacientes`, { xml }
    );
  }

  // ── Pacientes ───────────────────────────────────────────────────────────────
  getPacientes(): Observable<AdminPaciente[]> {
    return this.http.get<AdminPaciente[]>(`${API}/pacientes`);
  }

  getPacienteDetalhe(id: string): Observable<{ paciente: AdminPaciente; consultas: any[]; questionarios: any[] }> {
    return this.http.get<any>(`${API}/pacientes/${id}`);
  }

  deletePaciente(id: string): Observable<any> {
    return this.http.delete(`${API}/pacientes/${id}`);
  }
}
