import { Component, inject, HostListener } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class NavbarComponent {
  auth        = inject(AuthService);
  menuOpen    = false;
  dropdownOpen = false;

  toggleMenu()    { this.menuOpen = !this.menuOpen; }
  toggleDropdown() { this.dropdownOpen = !this.dropdownOpen; }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.navbar__user-btn')) {
      this.dropdownOpen = false;
    }
  }

  get dashboardRoute(): string {
    const role = this.auth.role();
    if (role === 'paciente')  return '/paciente/dashboard';
    if (role === 'psicologo') return '/psicologo/dashboard';
    if (role === 'admin')     return '/admin/dashboard';
    return '/';
  }

  get perfilRoute(): string {
    return this.auth.role() === 'paciente' ? '/paciente/perfil' : '/';
  }
}
