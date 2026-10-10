import { hash, verify } from '@node-rs/argon2';
import { verifyPassword as verifyLegacyPassword } from 'better-auth/crypto';

/** Supported Better Auth hooks; the maintained library supplies salt and PHC encoding. */
export const passwordHashing = {
  hash: (password: string) =>
    hash(password, {
      // Published API enum values (ambient const enums cannot be emitted by
      // isolatedModules): Argon2id = 2, version V0x13 = 1.
      algorithm: 2,
      version: 1,
      memoryCost: 32_768,
      timeCost: 3,
      parallelism: 1,
      outputLen: 32,
    }),
  async verify({ hash: encoded, password }: { hash: string; password: string }): Promise<boolean> {
    try {
      if (encoded.startsWith('$argon2id$')) return await verify(encoded, password);
      // Old scaffold accounts remain usable. A password change/operator recovery
      // writes Argon2id; no custom implementation of the prior scrypt verifier.
      if (/^[0-9a-f]{32}:[0-9a-f]{128}$/i.test(encoded)) {
        return await verifyLegacyPassword({ hash: encoded, password });
      }
      return false;
    } catch {
      return false;
    }
  },
};
