import { Request, Response, NextFunction } from 'express';
import { Gender } from '@prisma/client';
import { ValidationError } from '../types';

function parseCoordinate(value: unknown): number | null {
   if (value === undefined || value === null || value === '') {
      return null;
   }
   const parsed = Number(value);
   return Number.isFinite(parsed) ? parsed : null;
}

export function validateUserProfileUpdate(req: Request, _res: Response, next: NextFunction): void {
   try {
      const {
         firstName,
         lastName,
         address,
         contact,
         gender,
         location,
         age,
         username,
         preferences,
         avatar,
      } = req.body;

      const allowedFields = [
         'firstName',
         'lastName',
         'address',
         'contact',
         'gender',
         'location',
         'age',
         'username',
         'preferences',
         'avatar',
      ];
      const extraFields = Object.keys(req.body).filter((key) => !allowedFields.includes(key));
      if (extraFields.length > 0) {
         throw new ValidationError('Unexpected fields in request body', {
            fields: [`Unexpected fields: ${extraFields.join(', ')}`],
         });
      }

      if (firstName !== undefined) {
         if (typeof firstName !== 'string' || firstName.trim().length === 0 || firstName.length > 50) {
            throw new ValidationError('Invalid first name', { firstName: ['First name must be 1-50 characters'] });
         }
         req.body.firstName = firstName.trim();
      }

      if (lastName !== undefined) {
         if (typeof lastName !== 'string' || lastName.trim().length === 0 || lastName.length > 50) {
            throw new ValidationError('Invalid last name', { lastName: ['Last name must be 1-50 characters'] });
         }
         req.body.lastName = lastName.trim();
      }

      if (address !== undefined) {
         if (address !== null && (typeof address !== 'string' || address.trim().length === 0 || address.length > 500)) {
            throw new ValidationError('Invalid address', { address: ['Address must be 1-500 characters or null'] });
         }
         if (typeof address === 'string') {
            req.body.address = address.trim();
         }
      }

      if (contact !== undefined) {
         if (contact !== null && (typeof contact !== 'string' || contact.trim().length === 0 || contact.length > 50)) {
            throw new ValidationError('Invalid contact', { contact: ['Contact must be 1-50 characters or null'] });
         }
         if (typeof contact === 'string') {
            req.body.contact = contact.trim();
         }
      }

      if (gender !== undefined) {
         if (gender !== null && typeof gender !== 'string') {
            throw new ValidationError('Invalid gender', { gender: ['Gender must be a valid enum value or null'] });
         }
         const validGenders: Gender[] = ['MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY'];
         if (gender !== null && !validGenders.includes(gender as Gender)) {
            throw new ValidationError('Invalid gender', { gender: ['Gender must be a valid enum value or null'] });
         }
      }

      if (location !== undefined) {
         if (location === null) {
            // pass through — clears stored location
         } else if (typeof location === 'object' && !Array.isArray(location)) {
            const { latitude, longitude } = location as { latitude?: unknown; longitude?: unknown };
            const hasLatitude = latitude !== undefined && latitude !== null && latitude !== '';
            const hasLongitude = longitude !== undefined && longitude !== null && longitude !== '';

            if (hasLatitude !== hasLongitude) {
               throw new ValidationError('Invalid location', {
                  location: ['Latitude and longitude must be provided together'],
               });
            }

            const parsedLatitude = parseCoordinate(latitude);
            if (parsedLatitude === null || parsedLatitude < -90 || parsedLatitude > 90) {
               throw new ValidationError('Invalid location', { location: ['Latitude must be between -90 and 90'] });
            }

            const parsedLongitude = parseCoordinate(longitude);
            if (parsedLongitude === null || parsedLongitude < -180 || parsedLongitude > 180) {
               throw new ValidationError('Invalid location', { location: ['Longitude must be between -180 and 180'] });
            }

            req.body.location = { latitude: parsedLatitude, longitude: parsedLongitude };
         } else {
            throw new ValidationError('Invalid location', { location: ['Location must be coordinates or null'] });
         }
      }

      if (age !== undefined) {
         const parsedAge = age === null ? null : Number(age);
         if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 150)) {
            throw new ValidationError('Invalid age', { age: ['Age must be an integer between 1 and 150, or null'] });
         }
         req.body.age = parsedAge;
      }

      if (username !== undefined) {
         if (typeof username !== 'string' || username.trim().length < 3 || username.length > 50) {
            throw new ValidationError('Invalid username', { username: ['Username must be 3-50 characters'] });
         }
         req.body.username = username.trim().toLowerCase();
      }

      if (preferences !== undefined) {
         if (preferences !== null && (typeof preferences !== 'object' || Array.isArray(preferences))) {
            throw new ValidationError('Invalid preferences', { preferences: ['Preferences must be an object or null'] });
         }
      }

      if (avatar !== undefined && avatar !== null && typeof avatar !== 'string') {
         throw new ValidationError('Invalid avatar', { avatar: ['Avatar must be a string or null'] });
      }

      if (
         [firstName, lastName, address, contact, gender, location, age, username, preferences, avatar].every(
            (value) => value === undefined,
         ) &&
         !(req as Request & { file?: Express.Multer.File }).file
      ) {
         throw new ValidationError('No update fields provided', {
            fields: ['At least one profile field must be provided'],
         });
      }

      next();
   } catch (error) {
      next(error);
   }
}
