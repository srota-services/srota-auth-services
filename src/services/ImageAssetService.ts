import fs from 'fs';
import path from 'path';
import os from 'os';
import { ImageCategory, PrismaClient } from '@prisma/client';
import { config } from '../config/env';
import { ImageSpecService } from './ImageSpecService';
import { ImageProcessingService } from './ImageProcessingService';
import { StorageFactory } from './storage/StorageFactory';
import { fileUrlService } from './FileUrlService';
import { mediaCleanupService } from './MediaCleanupService';
import { AUTH_PRIMARY_VARIANT_KEY } from '../constants/imagePlaceholderSpecs';
import { runWrite } from '../utils/prismaTransaction';

export interface GenerateVariantsResult {
   primaryStorageKey: string;
   variants: Record<string, string>;
}

export class ImageAssetService {
   private readonly specService: ImageSpecService;
   private readonly processingService: ImageProcessingService;

   constructor(private readonly prisma: PrismaClient) {
      this.specService = new ImageSpecService(prisma);
      this.processingService = new ImageProcessingService();
   }

   buildStorageKey(category: ImageCategory, entityId: string, variantKey: string): string {
      return `uploads/images/${category}/${entityId}/${variantKey}.jpg`;
   }

   buildDevPublicPath(storageKey: string): string {
      return `/${storageKey}`;
   }

   async deleteAssetsForEntity(category: ImageCategory, entityId: string): Promise<void> {
      const assets = await this.prisma.imageAsset.findMany({
         where: { category, entityId },
      });

      for (const asset of assets) {
         await mediaCleanupService.deleteStoredFile(asset.storageKey);
      }

      await runWrite(this.prisma, (tx) =>
         tx.imageAsset.deleteMany({ where: { category, entityId } }),
      );
   }

   async generateAndStoreVariants(
      category: ImageCategory,
      entityId: string,
      sourcePath: string
   ): Promise<GenerateVariantsResult> {
      await this.specService.validateUpload(category, sourcePath);
      await this.deleteAssetsForEntity(category, entityId);

      const specs = await this.specService.getSpecsByCategory(category);
      const isDevelopment = config.NODE_ENV === 'development';
      const tempDir = isDevelopment
         ? path.join(config.DEV_UPLOAD_DIR, 'images', category, entityId)
         : path.join(os.tmpdir(), `image-variants-${entityId}-${Date.now()}`);

      fs.mkdirSync(tempDir, { recursive: true });

      const variants: Record<string, string> = {};
      const tempFiles: string[] = [];

      try {
         for (const spec of specs) {
            const outputPath = path.join(tempDir, `${spec.variantKey}.jpg`);
            await this.processingService.generateVariant(
               sourcePath,
               outputPath,
               spec.actualWidth,
               spec.actualHeight
            );
            tempFiles.push(outputPath);

            const storageKey = this.buildStorageKey(category, entityId, spec.variantKey);

            if (isDevelopment) {
               const devPath = path.join(config.DEV_UPLOAD_DIR, 'images', category, entityId, `${spec.variantKey}.jpg`);
               fs.mkdirSync(path.dirname(devPath), { recursive: true });
               fs.copyFileSync(outputPath, devPath);
               variants[spec.variantKey] = this.buildDevPublicPath(storageKey);
            } else {
               const storageProvider = StorageFactory.getStorageProvider();
               const fileBuffer = fs.readFileSync(outputPath);
               await storageProvider.uploadFile(storageKey, fileBuffer, 'image/jpeg');
               variants[spec.variantKey] = storageKey;
            }

            await runWrite(this.prisma, (tx) =>
               tx.imageAsset.upsert({
                  where: {
                     category_entityId_variantKey: {
                        category,
                        entityId,
                        variantKey: spec.variantKey,
                     },
                  },
                  update: {
                     storageKey: variants[spec.variantKey]!,
                     width: spec.actualWidth,
                     height: spec.actualHeight,
                  },
                  create: {
                     category,
                     entityId,
                     variantKey: spec.variantKey,
                     storageKey: variants[spec.variantKey]!,
                     width: spec.actualWidth,
                     height: spec.actualHeight,
                  },
               }),
            );
         }
      } finally {
         for (const file of tempFiles) {
            if (fs.existsSync(file)) {
               fs.unlinkSync(file);
            }
         }
         if (!isDevelopment && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
         }
      }

      const primaryStorageKey = variants[AUTH_PRIMARY_VARIANT_KEY]!;

      return { primaryStorageKey, variants };
   }

   async resolveAssetsForClient(
      category: ImageCategory,
      entityId: string
   ): Promise<Record<string, string>> {
      const assets = await this.prisma.imageAsset.findMany({
         where: { category, entityId },
      });

      const resolved: Record<string, string> = {};
      for (const asset of assets) {
         const url = await fileUrlService.resolveForClient(asset.storageKey);
         if (url) {
            resolved[asset.variantKey] = url;
         }
      }
      return resolved;
   }
}

export function createImageAssetService(prisma: PrismaClient): ImageAssetService {
   return new ImageAssetService(prisma);
}
