import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import {
   COLLABORATION_ATTACHMENT_MIMES,
   MAX_COLLABORATION_ATTACHMENT_BYTES,
   MAX_COLLABORATION_ATTACHMENTS,
} from '../constants/collaborationConstants';

const ensureUploadDirs = (): void => {
   const dirs = [config.DEV_UPLOAD_DIR, config.DEV_COLLABORATION_ATTACHMENT_DIR];
   dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
         fs.mkdirSync(dir, { recursive: true });
      }
   });
};

ensureUploadDirs();

const attachmentFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void => {
   if ((COLLABORATION_ATTACHMENT_MIMES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
      return;
   }
   cb(new Error('Only PDF, DOCX, PNG, and JPEG files are allowed'));
};

const attachmentStorage = multer.diskStorage({
   destination: (_req, _file, cb) => {
      cb(null, config.DEV_COLLABORATION_ATTACHMENT_DIR);
   },
   filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `collab-temp-${uniqueSuffix}${ext}`);
   },
});

const collaborationUpload = multer({
   storage: attachmentStorage,
   fileFilter: attachmentFilter,
   limits: {
      fileSize: MAX_COLLABORATION_ATTACHMENT_BYTES,
      files: MAX_COLLABORATION_ATTACHMENTS,
   },
});

export const handleOptionalCollaborationAttachmentsUpload = (
   req: Request,
   res: Response,
   next: NextFunction,
): void => {
   collaborationUpload.array('attachments', MAX_COLLABORATION_ATTACHMENTS)(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
         if (error.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({ error: 'Attachment file too large (max 10MB)', code: 'FILE_TOO_LARGE' });
            return;
         }
         if (error.code === 'LIMIT_FILE_COUNT') {
            res.status(400).json({ error: 'Too many attachments (max 5)', code: 'TOO_MANY_FILES' });
            return;
         }
         res.status(400).json({ error: error.message, code: 'UPLOAD_ERROR' });
         return;
      }
      if (error instanceof Error) {
         res.status(400).json({ error: error.message, code: 'UPLOAD_ERROR' });
         return;
      }

      const files = Array.isArray(req.files) ? req.files : [];
      (req as Request & { collaborationAttachmentFiles?: Express.Multer.File[] }).collaborationAttachmentFiles =
         files;
      next();
   });
};
