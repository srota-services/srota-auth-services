export const AuthRole = {
   LISTENER: 'LISTENER',
   GLOBAL_ADMIN: 'GLOBAL_ADMIN',
   ORG_ADMIN: 'ORG_ADMIN',
   ORG_COORDINATOR: 'ORG_COORDINATOR',
   AUTHOR: 'AUTHOR',
   GUEST: 'GUEST',
} as const;

export type AuthRoleValue = (typeof AuthRole)[keyof typeof AuthRole];

export const AuthRoleGroups = {
   GLOBAL_ADMIN_ONLY: [AuthRole.GLOBAL_ADMIN],
   GLOBAL_ADMIN_OR_AUTHOR: [AuthRole.GLOBAL_ADMIN, AuthRole.AUTHOR],
   ORG_STAFF: [AuthRole.ORG_ADMIN, AuthRole.ORG_COORDINATOR],
   PARTNER_APP: [
      AuthRole.GLOBAL_ADMIN,
      AuthRole.AUTHOR,
      AuthRole.ORG_ADMIN,
      AuthRole.ORG_COORDINATOR,
   ],
   ALL_REGISTERED: [
      AuthRole.LISTENER,
      AuthRole.GLOBAL_ADMIN,
      AuthRole.ORG_ADMIN,
      AuthRole.ORG_COORDINATOR,
      AuthRole.AUTHOR,
   ],
   ALL_AUTHENTICATED: [
      AuthRole.GUEST,
      AuthRole.LISTENER,
      AuthRole.GLOBAL_ADMIN,
      AuthRole.ORG_ADMIN,
      AuthRole.ORG_COORDINATOR,
      AuthRole.AUTHOR,
   ],
} as const;

export function normalizeAuthRole(role: string | undefined): string {
   return (role ?? '').trim().toLowerCase();
}

const STAFF_ROLES = new Set<string>([
   normalizeAuthRole(AuthRole.GLOBAL_ADMIN),
   normalizeAuthRole(AuthRole.ORG_ADMIN),
   normalizeAuthRole(AuthRole.ORG_COORDINATOR),
]);

export function isGlobalAdminRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) === normalizeAuthRole(AuthRole.GLOBAL_ADMIN);
}

export function isOrgAdminRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) === normalizeAuthRole(AuthRole.ORG_ADMIN);
}

export function isOrgCoordinatorRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) === normalizeAuthRole(AuthRole.ORG_COORDINATOR);
}

export function isStaffRole(role: string | undefined): boolean {
   return STAFF_ROLES.has(normalizeAuthRole(role));
}

export function isGlobalAuthorRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) === normalizeAuthRole(AuthRole.AUTHOR);
}

export function isOrgStaffRole(role: string | undefined): boolean {
   return isOrgAdminRole(role) || isOrgCoordinatorRole(role);
}

export function isGuestRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) === normalizeAuthRole(AuthRole.GUEST);
}

export function isRegisteredUserRole(role: string | undefined): boolean {
   const normalized = normalizeAuthRole(role);
   return AuthRoleGroups.ALL_REGISTERED.some(
      (allowed) => normalizeAuthRole(allowed) === normalized,
   );
}

/** Device is optional during registration OTP verify for all roles except LISTENER. */
export function isDeviceOptionalForRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) !== normalizeAuthRole(AuthRole.LISTENER);
}

/** Subscription device registration and removal quotas apply to LISTENER only. */
export function isDeviceLimitEnforcedRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) === normalizeAuthRole(AuthRole.LISTENER);
}

/** Active subscription tier checks apply to LISTENER and GUEST only. */
export function isSubscriptionGatingEnforcedRole(role: string | undefined): boolean {
   const normalized = normalizeAuthRole(role);
   return (
      normalized === normalizeAuthRole(AuthRole.LISTENER) ||
      normalized === normalizeAuthRole(AuthRole.GUEST)
   );
}

export function isPartnerAppRole(role: string | undefined): boolean {
   const normalized = normalizeAuthRole(role);
   return AuthRoleGroups.PARTNER_APP.some(
      (allowed) => normalizeAuthRole(allowed) === normalized,
   );
}
