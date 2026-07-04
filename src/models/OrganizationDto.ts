import {
   Organization as PrismaOrganization,
   OrganizationMember as PrismaOrganizationMember,
   OrganizationRole,
   OrganizationTeamSize,
} from '@prisma/client';

export type OrganizationRoleType = OrganizationRole;
export type OrganizationTeamSizeType = '1-10' | '11-50' | '51-200' | '200+';

export interface OrganizationDto {
   id: string;
   name: string;
   slug: string;
   description?: string | undefined;
   image?: string | null;
   imageAssets?: Record<string, string>;
   preferredGenre?: string | null;
   websiteUrl?: string | null;
   teamSize?: OrganizationTeamSizeType | null;
   discoverable?: boolean;
   createdAt: Date;
   updatedAt: Date;
   memberCount?: number | undefined;
}

export interface OrganizationMemberDto {
   id: string;
   userId: string;
   organizationId: string;
   role: OrganizationRoleType;
   joinedAt: Date;
   createdAt: Date;
   updatedAt: Date;
   organization?: OrganizationDto | undefined;
}

export interface CreateOrganizationDto {
   name: string;
   description?: string;
   image?: string;
   preferredGenre?: string | null;
   websiteUrl?: string | null;
   teamSize?: OrganizationTeamSizeType | null;
   discoverable?: boolean;
}

export interface UpdateOrganizationDto {
   name?: string;
   description?: string;
   image?: string;
   preferredGenre?: string | null;
   websiteUrl?: string | null;
   teamSize?: OrganizationTeamSizeType | null;
   discoverable?: boolean;
}

export interface AddOrganizationMemberDto {
   userId: string;
   role?: OrganizationRoleType;
}

export interface UpdateOrganizationMemberDto {
   role: OrganizationRoleType;
}

const TEAM_SIZE_TO_API: Record<OrganizationTeamSize, OrganizationTeamSizeType> = {
   SIZE_1_10: '1-10',
   SIZE_11_50: '11-50',
   SIZE_51_200: '51-200',
   SIZE_200_PLUS: '200+',
};

const API_TO_TEAM_SIZE: Record<OrganizationTeamSizeType, OrganizationTeamSize> = {
   '1-10': OrganizationTeamSize.SIZE_1_10,
   '11-50': OrganizationTeamSize.SIZE_11_50,
   '51-200': OrganizationTeamSize.SIZE_51_200,
   '200+': OrganizationTeamSize.SIZE_200_PLUS,
};

export function teamSizeToApi(
   teamSize: OrganizationTeamSize | null | undefined,
): OrganizationTeamSizeType | null {
   if (!teamSize) {
      return null;
   }
   return TEAM_SIZE_TO_API[teamSize];
}

export function parseTeamSizeFromApi(value: string): OrganizationTeamSize | null {
   const trimmed = value.trim() as OrganizationTeamSizeType;
   if (!trimmed) {
      return null;
   }
   const mapped = API_TO_TEAM_SIZE[trimmed];
   if (!mapped) {
      throw new Error('INVALID_TEAM_SIZE');
   }
   return mapped;
}

type OrganizationRecord = PrismaOrganization & {
   _count?: { members: number };
};

export function toOrganizationDto(organization: OrganizationRecord): OrganizationDto {
   return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      description: organization.description || undefined,
      image: organization.image ?? null,
      preferredGenre: organization.preferredGenre ?? null,
      websiteUrl: organization.websiteUrl ?? null,
      teamSize: teamSizeToApi(organization.teamSize),
      discoverable: organization.discoverable,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      memberCount: organization._count?.members,
   };
}

export function toOrganizationMemberDto(
   member: PrismaOrganizationMember & {
      organization?: PrismaOrganization;
   },
): OrganizationMemberDto {
   return {
      id: member.id,
      userId: member.userId,
      organizationId: member.organizationId,
      role: member.role,
      joinedAt: member.joinedAt,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      organization: member.organization ? toOrganizationDto(member.organization) : undefined,
   };
}
