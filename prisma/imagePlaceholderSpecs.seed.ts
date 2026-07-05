import { ImageCategory, PrismaClient } from '@prisma/client';

type SpecRow = {
   category: ImageCategory;
   variantKey: string;
   actualWidth: number;
   actualHeight: number;
   aspectRatioWidth: number;
   aspectRatioHeight: number;
   recommendedMaxWidth: number;
   recommendedMaxHeight: number;
};

const AUTH_IMAGE_SPECS: SpecRow[] = [
   {
      category: 'organization',
      variantKey: 'square_512',
      actualWidth: 512,
      actualHeight: 512,
      aspectRatioWidth: 1,
      aspectRatioHeight: 1,
      recommendedMaxWidth: 512,
      recommendedMaxHeight: 512,
   },
   { category: 'user', variantKey: 'square_64', actualWidth: 256, actualHeight: 256, aspectRatioWidth: 1, aspectRatioHeight: 1, recommendedMaxWidth: 480, recommendedMaxHeight: 480 },
   { category: 'user', variantKey: 'square_120', actualWidth: 480, actualHeight: 480, aspectRatioWidth: 1, aspectRatioHeight: 1, recommendedMaxWidth: 480, recommendedMaxHeight: 480 },
   { category: 'author', variantKey: 'square_64', actualWidth: 256, actualHeight: 256, aspectRatioWidth: 1, aspectRatioHeight: 1, recommendedMaxWidth: 480, recommendedMaxHeight: 480 },
   { category: 'author', variantKey: 'square_120', actualWidth: 480, actualHeight: 480, aspectRatioWidth: 1, aspectRatioHeight: 1, recommendedMaxWidth: 480, recommendedMaxHeight: 480 },
];

export async function seedImagePlaceholderSpecs(prisma: PrismaClient): Promise<void> {
   for (const row of AUTH_IMAGE_SPECS) {
      await prisma.imagePlaceholderSpec.upsert({
         where: {
            category_variantKey: {
               category: row.category,
               variantKey: row.variantKey,
            },
         },
         update: {
            actualWidth: row.actualWidth,
            actualHeight: row.actualHeight,
            aspectRatioWidth: row.aspectRatioWidth,
            aspectRatioHeight: row.aspectRatioHeight,
            recommendedMaxWidth: row.recommendedMaxWidth,
            recommendedMaxHeight: row.recommendedMaxHeight,
         },
         create: row,
      });
   }
}

export const AUTH_PRIMARY_VARIANT_KEYS: Record<ImageCategory, string> = {
   organization: 'square_512',
   user: 'square_120',
   author: 'square_120',
};
