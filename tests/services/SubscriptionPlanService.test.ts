import { SubscriptionTierLevel } from '@prisma/client';
import { SubscriptionPlanService } from '../../src/services/SubscriptionPlanService';
import { SubscriptionError } from '../../src/types/subscription';
import { attachPrismaTransaction } from '../helpers/prismaMock';

const mockPrisma = attachPrismaTransaction({
   subscriptionPlan: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
   },
   userSubscription: { count: jest.fn() },
}) as any;

describe('SubscriptionPlanService', () => {
   let service: SubscriptionPlanService;

   beforeEach(() => {
      service = new SubscriptionPlanService(mockPrisma);
      jest.clearAllMocks();
   });

   it('creates a plan when name is unique', async () => {
      mockPrisma.subscriptionPlan.findFirst.mockResolvedValue(null);
      mockPrisma.subscriptionPlan.create.mockResolvedValue({
         id: 'p1',
         name: 'Premium',
         description: null,
         price: '9.99',
         currency: 'USD',
         tierLevel: SubscriptionTierLevel.BASE,
         billingInterval: 'MONTHLY',
         trialDays: 0,
         features: null,
         isActive: true,
         createdAt: new Date(),
         updatedAt: new Date(),
      });
      const result = await service.createPlan({ name: 'Premium', price: 9.99, tierLevel: SubscriptionTierLevel.PREMIUM });
      expect(result.name).toBe('Premium');
      expect(result.price).toBe(9.99);
   });

   it('throws conflict on duplicate name', async () => {
      mockPrisma.subscriptionPlan.findFirst.mockResolvedValue({ id: 'p1', name: 'Premium' });
      await expect(service.createPlan({ name: 'Premium', price: 1, tierLevel: SubscriptionTierLevel.PREMIUM })).rejects.toBeInstanceOf(SubscriptionError);
   });
});
