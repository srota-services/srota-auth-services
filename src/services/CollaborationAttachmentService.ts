import fs from 'fs';
import path from 'path';
import { CollaborationActor } from '@prisma/client';
import { config } from '../config/env';

const COLLABORATION_STORAGE_PREFIX = 'uploads/collaborations';

function ensureCollaborationDir(collaborationId: string): string {
   const dir = path.join(config.DEV_COLLABORATION_ATTACHMENT_DIR, collaborationId);
   if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
   }
   return dir;
}

export async function persistCollaborationAttachments(
   collaborationId: string,
   files: Express.Multer.File[],
): Promise<Array<{
   storageKey: string;
   originalName: string;
   mimeType: string;
   sizeBytes: number;
   uploadedBy: CollaborationActor;
}>> {
   const dir = ensureCollaborationDir(collaborationId);
   const results: Array<{
      storageKey: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      uploadedBy: CollaborationActor;
   }> = [];

   for (const file of files) {
      const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`;
      const destination = path.join(dir, filename);

      if (file.path && fs.existsSync(file.path)) {
         fs.renameSync(file.path, destination);
      } else if (file.buffer) {
         fs.writeFileSync(destination, file.buffer);
      } else {
         throw new Error('Attachment file data is missing');
      }

      results.push({
         storageKey: `${COLLABORATION_STORAGE_PREFIX}/${collaborationId}/${filename}`,
         originalName: file.originalname,
         mimeType: file.mimetype,
         sizeBytes: file.size,
         uploadedBy: CollaborationActor.AUTHOR,
      });
   }

   return results;
}
