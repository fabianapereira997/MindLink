import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { guestGuard } from './core/guards/guest.guard';
import { loggedInGuard } from './core/guards/logged-in.guard';

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
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/register/register').then(m => m.RegisterComponent),
  },
  {
    path: 'change-password',
    canActivate: [loggedInGuard],
    loadComponent: () => import('./pages/auth/change-password/change-password').then(m => m.ChangePasswordComponent),
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
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/psicologo/dashboard/dashboard').then(m => m.PsicologoDashboardComponent),
      },
      {
        path: 'pacientes',
        loadComponent: () => import('./pages/psicologo/pacientes/pacientes').then(m => m.PsicologoPacientesComponent),
      },
      {
        path: 'pacientes/:id',
        loadComponent: () => import('./pages/psicologo/pacientes/paciente-detalhe').then(m => m.PsicologoPacienteDetalheComponent),
      },
      {
        path: 'agenda',
        loadComponent: () => import('./pages/psicologo/agenda/agenda').then(m => m.PsicologoAgendaComponent),
      },
      {
        path: 'desafios',
        loadComponent: () => import('./pages/psicologo/desafios/desafios').then(m => m.PsicologoDesafiosComponent),
      },
      {
        path: 'estatisticas',
        loadComponent: () => import('./pages/psicologo/estatisticas/estatisticas').then(m => m.PsicologoEstatisticasComponent),
      },
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
      {
        path: 'psicologos',
        loadComponent: () => import('./pages/admin/psicologos/psicologos').then(m => m.AdminPsicologosComponent),
      },
      {
        path: 'psicologos/:id',
        loadComponent: () => import('./pages/admin/psicologo-detalhe/psicologo-detalhe').then(m => m.AdminPsicologoDetalheComponent),
      },
      {
        path: 'pacientes',
        loadComponent: () => import('./pages/admin/pacientes/pacientes').then(m => m.AdminPacientesComponent),
      },
      {
        path: 'pacientes/:id',
        loadComponent: () => import('./pages/admin/paciente-detalhe/paciente-detalhe').then(m => m.AdminPacienteDetalheComponent),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },

  { path: '**', redirectTo: '' },
];
