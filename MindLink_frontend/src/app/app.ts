import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { NavbarComponent } from './shared/navbar/navbar';
import { FooterComponent } from './shared/footer/footer';
import { ChatComponent } from './shared/chat/chat';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, FooterComponent, ChatComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private router = inject(Router);

  /** Páginas de autenticação mostram apenas o logo, sem navbar. */
  isAuthPage = signal(this.computeIsAuthPage(this.router.url));

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.isAuthPage.set(this.computeIsAuthPage(e.urlAfterRedirects)));
  }

  private computeIsAuthPage(url: string): boolean {
    return url.startsWith('/login') || url.startsWith('/register');
  }
}
