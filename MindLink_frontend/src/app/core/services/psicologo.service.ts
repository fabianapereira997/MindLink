import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = 'http://localhost:8080/api';

export interface PsicologoProfile {
  _id: string;
  user?: { _id?: string; nome?: string; email?: string; genero?: string; data_nascimento?: string };
  especialidade?: string;
  pacientes?: any[];
}

@Injectable({ providedIn: 'root' })
export class PsicologoService {
  constructor(private http: HttpClient) {}

  getMyProfile(): Observable<PsicologoProfile> {
    return this.http.get<PsicologoProfile>(`${API}/psicologos/me`);
  }

  updateProfile(id: string, payload: { especialidade?: string }): Observable<PsicologoProfile> {
    return this.http.put<PsicologoProfile>(`${API}/psicologos/${id}`, payload);
  }
}
