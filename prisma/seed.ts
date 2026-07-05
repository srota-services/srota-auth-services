import { BillingInterval, Prisma, PrismaClient, SubscriptionTierLevel } from '@prisma/client';
import { config } from '../src/config/env';
import { SubscriptionPlanFeatures } from '../src/types/subscriptionPlanFeatures';
import { seedImagePlaceholderSpecs } from './imagePlaceholderSpecs.seed';

const prisma = new PrismaClient();

const PLANS: Array<{
   name: string;
   description: string;
   price: number;
   tierLevel: SubscriptionTierLevel;
   features: SubscriptionPlanFeatures;
}> = [
   {
      name: 'Base',
      description: 'Base subscription plan',
      price: 99,
      tierLevel: SubscriptionTierLevel.BASE,
      features: {
         audiobookCatalog: 'selected',
         maxDevices: 1,
         audioQuality: 'base',
         deviceChangesPerMonth: 0,
      },
   },
   {
      name: 'Standard',
      description: 'Standard subscription plan',
      price: 249,
      tierLevel: SubscriptionTierLevel.STANDARD,
      features: {
         audiobookCatalog: 'curated_wide',
         maxDevices: 2,
         audioQuality: 'high',
         deviceChangesPerMonth: 1,
      },
   },
   {
      name: 'Premium',
      description: 'Premium subscription plan',
      price: 399,
      tierLevel: SubscriptionTierLevel.PREMIUM,
      features: {
         audiobookCatalog: 'all',
         maxDevices: 3,
         audioQuality: 'best',
         deviceChangesPerMonth: 3,
      },
   },
];

async function main(): Promise<void> {
   console.log('Starting auth-service seed...');

   const existingCount = await prisma.subscriptionPlan.count();
   if (existingCount > 0) {
      console.log('Subscription plans already exist. Skipping plan seed.');
   } else {
      for (const plan of PLANS) {
         const record = await prisma.subscriptionPlan.create({
            data: {
               name: plan.name,
               description: plan.description,
               price: new Prisma.Decimal(plan.price),
               currency: config.SUBSCRIPTION_CURRENCY,
               tierLevel: plan.tierLevel,
               billingInterval: BillingInterval.MONTHLY,
               trialDays: 0,
               features: plan.features as unknown as Prisma.InputJsonValue,
               isActive: true,
            },
         });
         console.log(`Created plan: ${record.name} (tier ${record.tierLevel})`);
      }
      console.log('Subscription plan seed completed.');
   }

   await seedImagePlaceholderSpecs(prisma);
   console.log('Image placeholder specs seed completed.');
}

main()
   .catch((e) => {
      console.error('Seeding failed:', e);
      process.exit(1);
   })
   .finally(async () => {
      await prisma.$disconnect();
   });
