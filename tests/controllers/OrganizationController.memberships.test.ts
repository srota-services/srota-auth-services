import { Request, Response } from 'express';
import { OrganizationController } from '../../src/controllers/OrganizationController';

const mockGetOrganizationsForUser = jest.fn();

jest.mock('../../src/services/OrganizationService', () => ({
  OrganizationService: jest.fn().mockImplementation(() => ({
    getOrganizationsForUser: mockGetOrganizationsForUser,
  })),
  hasOwnerTierOrgAccess: jest.fn(),
}));

describe('OrganizationController.listMyOrganizationMemberships', () => {
  let controller: OrganizationController;
  let mockStatus: jest.Mock;
  let mockJson: jest.Mock;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = jest.fn().mockReturnThis();
    mockJson = jest.fn().mockReturnThis();
    mockResponse = { status: mockStatus, json: mockJson };
    controller = new OrganizationController({} as never);
  });

  it('returns organization memberships for the authenticated user', async () => {
    mockGetOrganizationsForUser.mockResolvedValue([
      { organizationId: 'org-1', role: 'ADMIN' },
      { organizationId: 'org-2', role: 'MEMBER' },
    ]);

    const mockRequest = {
      user: { id: 'user-1', role: 'ORG_ADMIN' },
    } as unknown as Request;

    await controller.listMyOrganizationMemberships(mockRequest, mockResponse as Response);

    expect(mockGetOrganizationsForUser).toHaveBeenCalledWith('user-1');
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({
      message: expect.any(String),
      memberships: [
        { organizationId: 'org-1', role: 'ADMIN' },
        { organizationId: 'org-2', role: 'MEMBER' },
      ],
    });
  });
});
