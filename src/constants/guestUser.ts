import { randomUUID } from 'crypto';

export const GUEST_EMAIL_DOMAIN = 'guest.srota.internal';

export function buildGuestEmail(): string {
   return `guest+${randomUUID()}@${GUEST_EMAIL_DOMAIN}`;
}

export function isGuestEmail(email: string | null | undefined): boolean {
   if (!email) {
      return false;
   }
   return email.trim().toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}
