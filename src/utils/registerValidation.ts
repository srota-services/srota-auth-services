import { Role } from '@prisma/client';
import { RegisterRequest, ValidationError } from '../types';
import { validateRegistrationPassword } from './passwordValidation';
import { validateIndianContact } from './phoneValidation';
import { isGuestEmail } from '../constants/guestUser';

const PUBLIC_REGISTER_ROLES = new Set<Role>([
   Role.LISTENER,
   Role.AUTHOR,
   Role.ORG_ADMIN,
   Role.ORG_COORDINATOR,
]);

function isOrgStaffRegisterRole(role: Role): boolean {
   return role === Role.ORG_ADMIN || role === Role.ORG_COORDINATOR;
}

function resolveContactField(
   contact: unknown,
   details: Record<string, string[]>,
   options: { required: boolean; requiredMessage: string },
): string | undefined {
   const trimmed =
      contact !== undefined && contact !== null ? String(contact).trim() : '';

   if (trimmed.length === 0) {
      if (options.required) {
         details['contact'] = [options.requiredMessage];
      }
      return undefined;
   }

   const validation = validateIndianContact(trimmed);
   if (validation.errors.length > 0) {
      details['contact'] = validation.errors;
      return undefined;
   }

   return validation.normalized;
}

export interface RegisterValidationOptions {
   isMultipart?: boolean;
}

export function validateRegisterRequest(
   body: RegisterRequest,
   options: RegisterValidationOptions = {},
): RegisterRequest {
   const { isMultipart = false } = options;
   const {
      email,
      password,
      firstName,
      lastName,
      address,
      contact,
      avatar,
      profileImage,
   } = body;

   const role = body.role ?? (isMultipart ? Role.AUTHOR : Role.LISTENER);

   if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required', { email: ['Email is required'] });
   }

   if (isGuestEmail(email)) {
      throw new ValidationError('Invalid email', {
         email: ['This email address cannot be used for registration'],
      });
   }

   if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required', { password: ['Password is required'] });
   }

   const passwordValidationErrors = validateRegistrationPassword(password, body.confirmPassword);
   if (Object.keys(passwordValidationErrors).length > 0) {
      throw new ValidationError('Invalid password', passwordValidationErrors);
   }

   if (role === Role.GLOBAL_ADMIN) {
      throw new ValidationError('Invalid role', {
         role: ['GLOBAL_ADMIN cannot be assigned during registration'],
      });
   }

   if (!PUBLIC_REGISTER_ROLES.has(role)) {
      throw new ValidationError('Invalid role', {
         role: ['Role must be LISTENER, AUTHOR, ORG_ADMIN, or ORG_COORDINATOR for registration'],
      });
   }

   if (isMultipart && role !== Role.AUTHOR) {
      throw new ValidationError('Author registration requires multipart/form-data', {
         role: ['AUTHOR registration must use multipart/form-data with role=AUTHOR'],
      });
   }

   if (!isMultipart && role === Role.AUTHOR) {
      throw new ValidationError('Author registration requires multipart/form-data', {
         role: ['AUTHOR registration must use multipart/form-data with role=AUTHOR'],
      });
   }

   if (role === Role.AUTHOR) {
      const details: Record<string, string[]> = {};

      if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
         details['firstName'] = ['First name is required for author registration'];
      }

      if (!lastName || typeof lastName !== 'string' || lastName.trim().length === 0) {
         details['lastName'] = ['Last name is required for author registration'];
      }

      if (!address || typeof address !== 'string' || address.trim().length === 0) {
         details['address'] = ['Address is required for author registration'];
      }

      const normalizedContact = resolveContactField(contact, details, {
         required: false,
         requiredMessage: 'Contact is required for author registration',
      });

      if (Object.keys(details).length > 0) {
         throw new ValidationError('Author registration requires additional fields', details);
      }

      const normalized: RegisterRequest = {
         email,
         password,
         role: Role.AUTHOR,
         firstName: firstName!.trim(),
         lastName: lastName!.trim(),
         address: address!.trim(),
         ...(normalizedContact !== undefined ? { contact: normalizedContact } : {}),
      };

      if (profileImage !== undefined && profileImage !== null && String(profileImage).trim().length > 0) {
         normalized.profileImage = String(profileImage).trim();
      }

      return normalized;
   }

   const userDetails: Record<string, string[]> = {};

   if (!address || typeof address !== 'string' || address.trim().length === 0) {
      userDetails['address'] = ['Address is required for user registration'];
   }

   const normalizedContact = resolveContactField(contact, userDetails, {
      required: true,
      requiredMessage: 'Contact is required for user registration',
   });

   if (Object.keys(userDetails).length > 0) {
      throw new ValidationError('User registration requires additional fields', userDetails);
   }

   const normalizedUser: RegisterRequest = {
      email,
      password,
      role: isOrgStaffRegisterRole(role) ? role : Role.LISTENER,
      address: address!.trim(),
      contact: normalizedContact!,
   };

   if (firstName !== undefined && firstName !== null && String(firstName).trim().length > 0) {
      normalizedUser.firstName = String(firstName).trim();
   }
   if (lastName !== undefined && lastName !== null && String(lastName).trim().length > 0) {
      normalizedUser.lastName = String(lastName).trim();
   }
   if (avatar !== undefined && avatar !== null && String(avatar).trim().length > 0) {
      normalizedUser.avatar = String(avatar).trim();
   }

   return normalizedUser;
}
