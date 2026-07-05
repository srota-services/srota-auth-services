import {
   AuthorOrganizationCollaborationStatus,
   AuthorOrganizationInvitationStatus,
} from '@prisma/client';

export const REJECTION_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const NEGOTIATION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_COLLABORATION_ATTACHMENTS = 5;
export const MAX_COLLABORATION_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const COLLABORATION_ATTACHMENT_MIMES = [
   'application/pdf',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'image/png',
   'image/jpeg',
] as const;

export const TERMINAL_COLLABORATION_STATUSES = new Set<AuthorOrganizationCollaborationStatus>([
   AuthorOrganizationCollaborationStatus.ACCEPTED,
   AuthorOrganizationCollaborationStatus.REJECTED,
   AuthorOrganizationCollaborationStatus.ABORTED,
]);

export const TERMINAL_INVITATION_STATUSES = new Set<AuthorOrganizationInvitationStatus>([
   AuthorOrganizationInvitationStatus.ACCEPTED,
   AuthorOrganizationInvitationStatus.DECLINED,
]);

export const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/;
