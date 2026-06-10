import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';

export interface AuthUser {
  _id: string;
  nome: string;
  email: string;
  tipo: 'paciente' | 'psicologo' | 'admin';
  genero: string;
  data_nascimento: string;
  mustChangePassword?: boolean;
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

const TOKEN_KEY = 'ml_token';
const USER_KEY  = 'ml_user';
const API       = 'http://localhost:8080/api';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user  = signal<AuthUser | null>(this.loadUser());
  private _token = signal<string | null>(this.loadToken());

  readonly user              = this._user.asReadonly();
  readonly isLoggedIn        = computed(() => !!this._token());
  readonly role              = computed(() => this._user()?.tipo ?? null);
  readonly firstName         = computed(() => this._user()?.nome?.split(' ')[0] ?? '');
  readonly mustChangePassword = computed(() => this._user()?.mustChangePassword ?? false);
  readonly homeRoute  = computed(() => {
    const tipo = this._user()?.tipo;
    if (tipo === 'paciente')  return '/paciente/home';
    if (tipo === 'psicologo') return '/psicologo/dashboard';
    if (tipo === 'admin')     return '/admin/dashboard';
    return '/';
  });

  constructor(private http: HttpClient, private router: Router) {}

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API}/users/login`, { email, password }).pipe(
      tap(res => {
        localStorage.setItem(TOKEN_KEY, res.token);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        this._token.set(res.token);
        this._user.set(res.user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this._token();
  }

  redirectAfterLogin(): void {
    if (this._user()?.mustChangePassword) {
      this.router.navigate(['/change-password']);
      return;
    }
    const tipo = this._user()?.tipo;
    if (tipo === 'paciente')       this.router.navigate(['/paciente/home']);
    else if (tipo === 'psicologo') this.router.navigate(['/psicologo/dashboard']);
    else if (tipo === 'admin')     this.router.navigate(['/admin/dashboard']);
    else this.router.navigate(['/']);
  }

  /** Update the logged-in user's own account data (nome, email, genero, data_nascimento, password). */
  updateUser(payload: Partial<AuthUser> & { password?: string }): Observable<AuthUser> {
    const id = this._user()?._id;
    return this.http.put<AuthUser>(`${API}/users/${id}`, payload).pipe(
      tap(updated => {
        const merged = { ...this._user(), ...updated } as AuthUser;
        localStorage.setItem(USER_KEY, JSON.stringify(merged));
        this._user.set(merged);
      })
    );
  }

  /** Called after a successful password change to clear the flag in memory. */
  clearMustChangePassword(): void {
    const u = this._user();
    if (!u) return;
    const updated = { ...u, mustChangePassword: false };
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
    this._user.set(updated);
  }

  private loadToken(): string | null {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    // Discard expired tokens immediately on load
    if (this.isTokenExpired(token)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return null;
    }
    return token;
  }

  private loadUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  /** Decode JWT payload and check expiry without a library. */
  private isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // exp is in seconds; add 10s buffer
      return payload.exp * 1000 < Date.now() - 10_000;
    } catch {
      return true;
    }
  }
}
