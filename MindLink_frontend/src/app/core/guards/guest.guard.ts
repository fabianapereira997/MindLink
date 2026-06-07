import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/**
 * Blocks access to public-only routes (landing, login) when the user
 * is already authenticated. Redirects them to their role-based home.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);

  if (auth.isLoggedIn()) {
    auth.redirectAfterLogin();
    return false;
  }

  return true;
};
