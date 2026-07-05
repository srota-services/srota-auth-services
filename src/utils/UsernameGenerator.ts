import { PrismaClient } from '@prisma/client';

export interface UsernameGenerationOptions {
   wordCount?: number;
   numberCount?: number;
   maxRetries?: number;
}

export interface UsernameGenerationResult {
   username: string;
   attempts: number;
}

export class UsernameGenerator {
   private adjectives = [
      'happy', 'bright', 'swift', 'clever', 'brave', 'calm', 'cool', 'wild',
      'gentle', 'strong', 'wise', 'bold', 'kind', 'free', 'pure', 'true',
      'quick', 'sharp', 'smooth', 'solid', 'fresh', 'clear', 'deep', 'high',
   ];

   private nouns = [
      'tiger', 'eagle', 'wolf', 'bear', 'fox', 'lion', 'deer', 'hawk',
      'falcon', 'raven', 'owl', 'dove', 'swan', 'fish', 'star', 'moon',
      'river', 'mountain', 'forest', 'ocean', 'storm', 'wind', 'fire', 'ice',
   ];

   constructor(private prisma: PrismaClient) {}

   async generateUniqueUsername(options: UsernameGenerationOptions = {}): Promise<UsernameGenerationResult> {
      const { wordCount = 2, numberCount = 4, maxRetries = 10 } = options;

      for (let attempts = 1; attempts <= maxRetries; attempts += 1) {
         const username = this.generateUsername(wordCount, numberCount);
         const isUnique = await this.isUsernameUnique(username);
         if (isUnique) {
            return { username, attempts };
         }
      }

      throw new Error(`Failed to generate unique username after ${maxRetries} attempts`);
   }

   private generateUsername(wordCount: number, numberCount: number): string {
      const words: string[] = [];

      for (let i = 0; i < Math.ceil(wordCount / 2); i += 1) {
         const randomAdjective = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
         if (randomAdjective) {
            words.push(randomAdjective);
         }
      }

      for (let i = 0; i < Math.floor(wordCount / 2); i += 1) {
         const randomNoun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
         if (randomNoun) {
            words.push(randomNoun);
         }
      }

      return [...words, this.generateRandomNumbers(numberCount)].join('-');
   }

   private generateRandomNumbers(count: number): string {
      let numbers = '';
      for (let i = 0; i < count; i += 1) {
         numbers += Math.floor(Math.random() * 10).toString();
      }
      return numbers;
   }

   private async isUsernameUnique(username: string): Promise<boolean> {
      const existingUser = await this.prisma.user.findUnique({
         where: { username },
         select: { id: true },
      });
      return !existingUser;
   }

   static isValidUsername(username: string): boolean {
      const usernameRegex = /^[a-z]+(-[a-z0-9]+)*$/;
      return usernameRegex.test(username) && username.length >= 3 && username.length <= 50;
   }
}
