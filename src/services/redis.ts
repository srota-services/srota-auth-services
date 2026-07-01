import { createClient, RedisClientType } from 'redis';
import { config } from '../config/env';
import { RevokedToken, JWKS, PendingAuthorRegistration, PendingUserRegistration } from '../types';
import { redisLogger } from '../utils/logger';

/**
 * Redis service for token revocation and blocklist management
 */
export class RedisService {
   private client: RedisClientType;
   private isConnected: boolean = false;

   constructor() {
      this.client = createClient({
         url: config.REDIS_URL,
      });

      this.client.on('error', (err) => {
         redisLogger.error({ err }, 'Redis client error');
         this.isConnected = false;
      });

      this.client.on('connect', () => {
         redisLogger.info('Redis client connected');
         this.isConnected = true;
      });

      this.client.on('disconnect', () => {
         redisLogger.info('Redis client disconnected');
         this.isConnected = false;
      });
   }

   /**
    * Connect to Redis
    */
   async connect(): Promise<void> {
      if (!this.isConnected) {
         await this.client.connect();
      }
   }

   /**
    * Disconnect from Redis
    */
   async disconnect(): Promise<void> {
      try {
         if (this.client.isOpen) {
            await this.client.disconnect();
         }
      } finally {
         this.isConnected = false;
      }
   }

   /**
    * Add a token to the blocklist
    */
   async revokeToken(jti: string, userId: string, reason?: string): Promise<void> {
      try {
         const revokedToken: RevokedToken = {
            jti,
            userId,
            revokedAt: new Date(),
            ...(reason && { reason }),
         };

         // Store with TTL of 7 days (access token expiry)
         await this.client.setEx(
            `revoked:${jti}`,
            604800, // 7 days in seconds (7 * 24 * 60 * 60)
            JSON.stringify(revokedToken)
         );

         redisLogger.info({ jti, userId }, 'Token revoked');
      } catch (error) {
         redisLogger.error({ err: error, jti, userId }, 'Failed to revoke token');
         throw new Error('Failed to revoke token');
      }
   }

   /**
    * Check if a token is revoked
    */
   async isTokenRevoked(jti: string): Promise<boolean> {
      try {
         const result = await this.client.get(`revoked:${jti}`);
         return result !== null;
      } catch (error) {
         redisLogger.error({ err: error, jti }, 'Failed to check token revocation');
         // In case of Redis error, assume token is not revoked to avoid blocking valid users
         return false;
      }
   }

   /**
    * Get revoked token details
    */
   async getRevokedToken(jti: string): Promise<RevokedToken | null> {
      try {
         const result = await this.client.get(`revoked:${jti}`);
         if (!result) {
            return null;
         }
         return JSON.parse(result) as RevokedToken;
      } catch (error) {
         redisLogger.error({ err: error, jti }, 'Failed to get revoked token');
         return null;
      }
   }

   /**
    * Revoke all tokens for a user (emergency revoke)
    */
   async revokeAllUserTokens(userId: string, reason: string = 'Emergency revoke'): Promise<void> {
      try {
         // This would require scanning all keys, which is expensive
         // In production, you might want to maintain a separate index
         // For now, we'll log this action and let tokens expire naturally
         redisLogger.info({ userId, reason }, 'Emergency revoke requested');

         // Store a marker for this user's emergency revoke
         await this.client.setEx(
            `emergency_revoke:${userId}`,
            3600, // 1 hour
            JSON.stringify({
               userId,
               revokedAt: new Date(),
               reason,
            })
         );
      } catch (error) {
         redisLogger.error({ err: error, userId }, 'Failed to emergency revoke user tokens');
         throw new Error('Failed to emergency revoke user tokens');
      }
   }

   /**
    * Check if user has emergency revoke
    */
   async hasEmergencyRevoke(userId: string): Promise<boolean> {
      try {
         const result = await this.client.get(`emergency_revoke:${userId}`);
         return result !== null;
      } catch (error) {
         redisLogger.error({ err: error, userId }, 'Failed to check emergency revoke');
         return false;
      }
   }

   /**
    * Store PKCE session data
    */
   async storePKCESession(sessionId: string, data: any, ttl: number = 600): Promise<void> {
      try {
         await this.client.setEx(
            `pkce:${sessionId}`,
            ttl,
            JSON.stringify(data)
         );
      } catch (error) {
         redisLogger.error({ err: error, sessionId }, 'Failed to store PKCE session');
         throw new Error('Failed to store PKCE session');
      }
   }

   /**
    * Get PKCE session data
    */
   async getPKCESession(sessionId: string): Promise<any | null> {
      try {
         const result = await this.client.get(`pkce:${sessionId}`);
         if (!result) {
            return null;
         }
         return JSON.parse(result);
      } catch (error) {
         redisLogger.error({ err: error, sessionId }, 'Failed to get PKCE session');
         return null;
      }
   }

   /**
    * Delete PKCE session data
    */
   async deletePKCESession(sessionId: string): Promise<void> {
      try {
         await this.client.del(`pkce:${sessionId}`);
      } catch (error) {
         redisLogger.error({ err: error, sessionId }, 'Failed to delete PKCE session');
      }
   }

   /**
    * Cache JWKS (JSON Web Key Set) in Redis
    */
   async cacheJWKS(jwks: JWKS, ttl: number = 3600): Promise<void> {
      try {
         await this.client.setEx('jwks:current', ttl, JSON.stringify(jwks));
      } catch (error) {
         redisLogger.error({ err: error }, 'Failed to cache JWKS');
         throw new Error('Failed to cache JWKS');
      }
   }

   /**
    * Get cached JWKS from Redis
    */
   async getCachedJWKS(): Promise<JWKS | null> {
      try {
         const result = await this.client.get('jwks:current');
         if (!result) {
            return null;
         }
         return JSON.parse(result) as JWKS;
      } catch (error) {
         redisLogger.error({ err: error }, 'Failed to get cached JWKS');
         return null;
      }
   }

   /**
    * Invalidate JWKS cache
    */
   async invalidateJWKSCache(): Promise<void> {
      try {
         await this.client.del('jwks:current');
         redisLogger.info('JWKS cache invalidated');
      } catch (error) {
         redisLogger.error({ err: error }, 'Failed to invalidate JWKS cache');
      }
   }

   /**
    * Store key hash for key rotation detection
    */
   async storeKeyHash(keyHash: string): Promise<void> {
      try {
         // Store without TTL (persistent until key rotation)
         await this.client.set('jwks:key_hash', keyHash);
         redisLogger.info('Key hash stored successfully');
      } catch (error) {
         redisLogger.error({ err: error }, 'Failed to store key hash');
      }
   }

   /**
    * Get stored key hash
    */
   async getKeyHash(): Promise<string | null> {
      try {
         const result = await this.client.get('jwks:key_hash');
         return result;
      } catch (error) {
         redisLogger.error({ err: error }, 'Failed to get key hash');
         return null;
      }
   }

   /**
    * Health check
    */
   async healthCheck(): Promise<boolean> {
      try {
         await this.client.ping();
         return true;
      } catch (_error) {
         return false;
      }
   }

   private pendingAuthorKey(userId: string): string {
      return `pending-author:${userId}`;
   }

   private pendingUserKey(userId: string): string {
      return `pending-user:${userId}`;
   }

   /**
    * Store pending author registration metadata until OTP verification (10 min TTL)
    */
   async setPendingAuthorRegistration(
      userId: string,
      data: PendingAuthorRegistration,
      ttlSeconds: number = 600,
   ): Promise<void> {
      try {
         await this.client.setEx(
            this.pendingAuthorKey(userId),
            ttlSeconds,
            JSON.stringify(data),
         );
      } catch (error) {
         redisLogger.error({ err: error, userId }, 'Failed to store pending author registration');
         throw new Error('Failed to store author registration data');
      }
   }

   /**
    * Get pending author registration metadata
    */
   async getPendingAuthorRegistration(userId: string): Promise<PendingAuthorRegistration | null> {
      try {
         const result = await this.client.get(this.pendingAuthorKey(userId));
         if (!result) {
            return null;
         }
         return JSON.parse(result) as PendingAuthorRegistration;
      } catch (error) {
         redisLogger.error({ err: error, userId }, 'Failed to get pending author registration');
         return null;
      }
   }

   /**
    * Delete pending author registration metadata
    */
   async deletePendingAuthorRegistration(userId: string): Promise<void> {
      try {
         await this.client.del(this.pendingAuthorKey(userId));
      } catch (error) {
         redisLogger.error({ err: error, userId }, 'Failed to delete pending author registration');
      }
   }

   /**
    * Store pending user registration metadata until OTP verification (10 min TTL)
    */
   async setPendingUserRegistration(
      userId: string,
      data: PendingUserRegistration,
      ttlSeconds: number = 600,
   ): Promise<void> {
      try {
         await this.client.setEx(
            this.pendingUserKey(userId),
            ttlSeconds,
            JSON.stringify(data),
         );
      } catch (error) {
         redisLogger.error({ err: error, userId }, 'Failed to store pending user registration');
         throw new Error('Failed to store user registration data');
      }
   }

   /**
    * Get pending user registration metadata
    */
   async getPendingUserRegistration(userId: string): Promise<PendingUserRegistration | null> {
      try {
         const result = await this.client.get(this.pendingUserKey(userId));
         if (!result) {
            return null;
         }
         return JSON.parse(result) as PendingUserRegistration;
      } catch (error) {
         redisLogger.error({ err: error, userId }, 'Failed to get pending user registration');
         return null;
      }
   }

   /**
    * Delete pending user registration metadata
    */
   async deletePendingUserRegistration(userId: string): Promise<void> {
      try {
         await this.client.del(this.pendingUserKey(userId));
      } catch (error) {
         redisLogger.error({ err: error, userId }, 'Failed to delete pending user registration');
      }
   }

   /**
    * Publish a message to a Redis pub/sub channel (SSE domain events).
    */
   async publish(channel: string, message: string): Promise<void> {
      await this.client.publish(channel, message);
   }

   /**
    * Duplicate client for SSE subscriptions (must not share with publish connection).
    */
   createSubscriberClient(): ReturnType<RedisClientType['duplicate']> {
      return this.client.duplicate();
   }

   /**
    * Acquire a short-lived distributed lock (SET NX EX). Returns true if lock was acquired.
    */
   async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
      try {
         const result = await this.client.set(key, '1', { NX: true, EX: ttlSeconds });
         return result === 'OK';
      } catch (error) {
         redisLogger.error({ err: error, key }, 'Failed to acquire Redis lock');
         return false;
      }
   }

   /**
    * Release a distributed lock.
    */
   async releaseLock(key: string): Promise<void> {
      try {
         await this.client.del(key);
      } catch (error) {
         redisLogger.error({ err: error, key }, 'Failed to release Redis lock');
      }
   }
}

// Singleton instance
export const redisService = new RedisService();
