import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

const ensureUploadDirs = (): void => {
   const dirs = [config.DEV_UPLOAD_DIR, config.DEV_AUTHOR_IMAGE_DIR, config.DEV_USER_AVATAR_DIR];
   dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
         fs.mkdirSync(dir, { recursive: true });
      }
   });
};

ensureUploadDirs();

const imageFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void => {
   const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
   if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
   } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
   }
};

const authorImageStorage = multer.diskStorage({
   destination: (_req, _file, cb) => {
      cb(null, config.DEV_AUTHOR_IMAGE_DIR);
   },
   filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `profile-${uniqueSuffix}${ext}`);
   },
});

const userAvatarStorage = multer.diskStorage({
   destination: (_req, _file, cb) => {
      cb(null, config.DEV_USER_AVATAR_DIR);
   },
   filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `avatar-${uniqueSuffix}${ext}`);
   },
});

const authorUpload = multer({
   storage: authorImageStorage,
   fileFilter: imageFilter,
   limits: { fileSize: config.MAX_FILE_SIZE },
});

const userAvatarUpload = multer({
   storage: userAvatarStorage,
   fileFilter: imageFilter,
   limits: { fileSize: config.MAX_FILE_SIZE },
});

export const handleOptionalAuthorProfileImageUpload = (
   req: Request,
   res: Response,
   next: NextFunction,
): void => {
   authorUpload.single('profileImage')(req, res, (error) => {
      if (error) {
         next(error);
         return;
      }
      next();
   });
};

export const handleOptionalUserAvatarUpload = (
   req: Request,
   res: Response,
   next: NextFunction,
): void => {
   userAvatarUpload.single('avatar')(req, res, (error) => {
      if (error) {
         next(error);
         return;
      }
      next();
   });
};
