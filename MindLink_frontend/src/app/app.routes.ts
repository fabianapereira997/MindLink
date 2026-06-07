import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  // ── Public (only when NOT logged in) ────────────────────────────────────────
  {
    path: '',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/landing/landing').then(m => m.LandingComponent),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login/login').then(m => m.LoginComponent),
  },

  // ── Paciente ─────────────────────────────────────────────────────────────────
  {
    path: 'paciente',
    canActivate: [authGuard, roleGuard('paciente')],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./pages/paciente/home/home').then(m => m.PacienteHomeComponent),
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/paciente/dashboard/dashboard').then(m => m.PacienteDashboardComponent),
      },
      {
        path: 'perfil',
        loadComponent: () => import('./pages/paciente/perfil/perfil').then(m => m.PacientePerfilComponent),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },

  // ── Psicologo ────────────────────────────────────────────────────────────────
  {
    path: 'psicologo',
    canActivate: [authGuard, roleGuard('psicologo')],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/psicologo/dashboard/dashboard').then(m => m.PsicologoDashboardComponent),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },

  // ── Admin ─────────────────────────────────────────────────────────────────────
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('admin')],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/admin/dashboard/dashboard').then(m => m.AdminDashboardComponent),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },

  { path: '**', redirectTo: '' },
];
