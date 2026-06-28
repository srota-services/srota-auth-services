import { Request, Response, NextFunction } from 'express';
import { isGuestRole } from '../constants/authRoles';

const PROFILE_UPDATE_PATH = '/user/profile';

const NON_LOCATION_PROFILE_FIELDS = [
   'firstName',
   'lastName',
   'address',
   'contact',
   'gender',
   'age',
] as const;

type AuthenticatedRequest = Request & {
   user?: {
      id: string;
      email: string;
      role: string;
   };
};

/**
 * True when the request is a PUT to /user/profile that updates only location.
 * Used to allow guest users to set their location for catalog personalization.
 */
export function isGuestLocationOnlyProfileUpdate(req: Request): boolean {
   if (req.method.toUpperCase() !== 'PUT') {
      return false;
   }

   const path = req.path.replace(/\/$/, '');
   if (path !== PROFILE_UPDATE_PATH) {
      return false;
   }

   const body = req.body ?? {};
   const hasLocationUpdate = body.location !== undefined;
   const hasNonLocationUpdate = NON_LOCATION_PROFILE_FIELDS.some(
      (field) => body[field] !== undefined,
   );

   return hasLocationUpdate && !hasNonLocationUpdate;
}

/**
 * Block guest users from write operations (POST, PUT, PATCH, DELETE).
 * Guests may update their profile location via PUT /auth/user/profile when
 * location is the only field in the request body.
 */
export function blockGuestMutations() {
   return (req: Request, res: Response, next: NextFunction): void => {
      const authReq = req as AuthenticatedRequest;

      if (!authReq.user) {
         res.status(401).json({ error: 'Authentication required' });
         return;
      }

      const method = req.method.toUpperCase();
      if (
         isGuestRole(authReq.user.role) &&
         (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')
      ) {
         if (isGuestLocationOnlyProfileUpdate(req)) {
            next();
            return;
         }

         res.status(403).json({
            error: 'Please sign up or log in to access this feature',
         });
         return;
      }

      next();
   };
}
