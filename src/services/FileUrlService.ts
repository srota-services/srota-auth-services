import fs from 'fs';
import path from 'path';
import { config } from '../config/env';
import { getFileUrl } from '../middleware/RegisterUploadMiddleware';
import { StorageFactory } from './storage/StorageFactory';
import { prisma } from '../lib/prisma';
import { ImageAssetService } from './ImageAssetService';

export type ImageKeyDirectory =
   | 'uploads/images/users'
   | 'uploads/images/authors'
   | 'uploads/images/organizations';

export class FileUrlService {
   private imageAssetService = new ImageAssetService(prisma);

   shouldSignUrls(): boolean {
      return config.NODE_ENV !== 'development';
   }

   normalizeToS3Key(stored: string): string | null {
      const trimmed = stored.trim();
      if (!trimmed) {
         return null;
      }

      if (trimmed.startsWith('file://')) {
         return null;
      }

      if (trimmed.startsWith('/uploads/')) {
         return trimmed.slice(1);
      }

      if (trimmed.startsWith('uploads/')) {
         return trimmed.replace(/\\/g, '/');
      }

      if (/^https?:\/\//i.test(trimmed)) {
         return this.extractKeyFromHttpUrl(trimmed);
      }

      if (path.isAbsolute(trimmed) || /^[A-Za-z]:\\/.test(trimmed)) {
         return null;
      }

      return trimmed.replace(/\\/g, '/');
   }

   private extractKeyFromHttpUrl(urlString: string): string | null {
      try {
         const url = new URL(urlString);
         const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

         if (config.AWS_S3_BUCKET && pathname.startsWith(`${config.AWS_S3_BUCKET}/`)) {
            return pathname.slice(config.AWS_S3_BUCKET.length + 1);
         }

         if (config.AWS_S3_ENDPOINT) {
            const endpointHost = new URL(config.AWS_S3_ENDPOINT).host;
            if (url.host === endpointHost && pathname.startsWith(`${config.AWS_S3_BUCKET}/`)) {
               return pathname.slice(config.AWS_S3_BUCKET.length + 1);
            }
         }

         if (url.hostname.startsWith(`${config.AWS_S3_BUCKET}.`)) {
            return pathname;
         }

         return null;
      } catch {
         return null;
      }
   }

   async resolveForClient(stored?: string | null): Promise<string | undefined> {
      if (!stored) {
         return undefined;
      }

      const trimmed = stored.trim();
      if (!trimmed) {
         return undefined;
      }

      if (!this.shouldSignUrls()) {
         if (trimmed.startsWith('/uploads/')) {
            return trimmed;
         }
         return getFileUrl(trimmed);
      }

      const key = this.normalizeToS3Key(trimmed);
      if (!key) {
         return trimmed;
      }

      const storageProvider = StorageFactory.getStorageProvider();
      return storageProvider.getFileUrl(key, config.AWS_SIGNED_URL_EXPIRES_IN);
   }

   async uploadLocalFileToStorage(
      localPath: string,
      s3Key: string,
      contentType: string,
   ): Promise<string> {
      const fileBuffer = fs.readFileSync(localPath);
      const storageProvider = StorageFactory.getStorageProvider();
      await storageProvider.uploadFile(s3Key, fileBuffer, contentType);
      return s3Key.replace(/\\/g, '/');
   }

   async processUploadedImageFile(
      localPath: string,
      keyDirectory: ImageKeyDirectory,
      contentType = 'image/jpeg',
      filenamePrefix = 'image',
   ): Promise<string> {
      if (!this.shouldSignUrls()) {
         return getFileUrl(localPath);
      }

      const ext = path.extname(localPath) || '.jpg';
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const s3Key = `${keyDirectory}/${filenamePrefix}-${uniqueSuffix}${ext}`;

      const storedKey = await this.uploadLocalFileToStorage(localPath, s3Key, contentType);

      if (fs.existsSync(localPath)) {
         fs.unlinkSync(localPath);
      }

      return storedKey;
   }

   async resolveOrganizationMedia<T extends { id: string; image?: string | null }>(
      dto: T,
   ): Promise<T & { imageAssets: Record<string, string> }> {
      const image = await this.resolveForClient(dto.image);
      const imageAssets = await this.imageAssetService.resolveAssetsForClient('organization', dto.id);
      return {
         ...dto,
         image: image ?? dto.image ?? null,
         imageAssets,
      };
   }

   async resolveOrganizationMediaList<T extends { id: string; image?: string | null }>(
      dtos: T[],
   ): Promise<(T & { imageAssets: Record<string, string> })[]> {
      return Promise.all(dtos.map((dto) => this.resolveOrganizationMedia(dto)));
   }

   async resolveAuthorMedia<T extends { id: string; avatar?: string | null }>(
      dto: T,
   ): Promise<T & { avatar?: string | null; imageAssets: Record<string, string> }> {
      const avatar = await this.resolveForClient(dto.avatar);
      const imageAssets = await this.imageAssetService.resolveAssetsForClient('author', dto.id);
      return {
         ...dto,
         avatar: avatar ?? dto.avatar ?? null,
         imageAssets,
      };
   }

   async resolveAuthorMediaList<T extends { id: string; avatar?: string | null }>(
      dtos: T[],
   ): Promise<(T & { avatar?: string | null; imageAssets: Record<string, string> })[]> {
      return Promise.all(dtos.map((dto) => this.resolveAuthorMedia(dto)));
   }

   async resolveUserMedia<T extends { id: string; avatar?: string | null }>(
      dto: T,
   ): Promise<T & { avatar?: string | null; imageAssets: Record<string, string> }> {
      const avatar = await this.resolveForClient(dto.avatar);
      const imageAssets = await this.imageAssetService.resolveAssetsForClient('user', dto.id);
      return {
         ...dto,
         avatar: avatar ?? dto.avatar ?? null,
         imageAssets,
      };
   }
}

export const fileUrlService = new FileUrlService();
