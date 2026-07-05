import { Request, Response } from 'express';
import { userProfileService } from '../services/userProfile';
import { UpdateUserProfileRequest } from '../types';
import { handleDomainError } from '../utils/domainController';

export class UserProfileController {
   async updateProfile(req: Request, res: Response): Promise<void> {
      try {
         const userId = (req as Request & { user: { id: string } }).user.id;
         const avatarFile = (req as Request & { file?: Express.Multer.File }).file;
         const updated = await userProfileService.updateUserProfile(
            userId,
            req.body as UpdateUserProfileRequest,
            avatarFile?.path,
         );

         res.json({
            message: 'Profile updated successfully',
            user: updated,
         });
      } catch (error) {
         handleDomainError(res, error);
      }
   }

   async getProfile(req: Request, res: Response): Promise<void> {
      try {
         const userId = (req as Request & { user: { id: string } }).user.id;
         const user = await userProfileService.getUserProfile(userId);
         res.json({ user });
      } catch (error) {
         handleDomainError(res, error);
      }
   }

   async getPublicProfile(req: Request, res: Response): Promise<void> {
      try {
         const { userId } = req.params as { userId: string };
         const profile = await userProfileService.getPublicUserProfile(userId);
         if (!profile) {
            res.status(404).json({ error: 'User profile not found' });
            return;
         }
         res.json({ profile });
      } catch (error) {
         handleDomainError(res, error);
      }
   }
}

export const userProfileController = new UserProfileController();
