import { buildGuestEmail, isGuestEmail, GUEST_EMAIL_DOMAIN } from '../../src/constants/guestUser';

describe('guestUser constants', () => {
   test('buildGuestEmail uses reserved guest domain', () => {
      const email = buildGuestEmail();
      expect(email).toMatch(new RegExp(`^guest\\+[0-9a-f-]+@${GUEST_EMAIL_DOMAIN.replace('.', '\\.')}$`));
   });

   test('isGuestEmail identifies guest domain emails', () => {
      expect(isGuestEmail(`guest+abc@${GUEST_EMAIL_DOMAIN}`)).toBe(true);
      expect(isGuestEmail('user@example.com')).toBe(false);
      expect(isGuestEmail(undefined)).toBe(false);
   });
});
