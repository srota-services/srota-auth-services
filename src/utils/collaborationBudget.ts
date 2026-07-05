import { Prisma } from '@prisma/client';
import { ISO_CURRENCY_PATTERN } from '../constants/collaborationConstants';
import { domainMessages } from './domainMessages';
import { DomainError } from '../types/domain';

const msg = domainMessages.error.authorCollaborations;

export function parseCollaborationBudget(value: unknown, label: string): Prisma.Decimal {
   if (value === undefined || value === null) {
      throw DomainError.validation(`${label} is required`);
   }

   const numeric =
      typeof value === 'number'
         ? value
         : typeof value === 'string'
           ? Number(value.trim())
           : NaN;

   if (!Number.isFinite(numeric) || numeric <= 0) {
      throw DomainError.validation(msg.budget_invalid);
   }

   const scaled = Math.round(numeric * 100) / 100;
   if (Math.abs(scaled - numeric) > 0.000001) {
      throw DomainError.validation(msg.budget_precision_invalid);
   }

   return new Prisma.Decimal(scaled.toFixed(2));
}

export function parseCollaborationCurrency(value: unknown): string {
   if (typeof value !== 'string' || !ISO_CURRENCY_PATTERN.test(value.trim().toUpperCase())) {
      throw DomainError.validation(msg.currency_invalid);
   }
   return value.trim().toUpperCase();
}

export function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
   if (value === null || value === undefined) {
      return null;
   }
   return Number(value.toString());
}
