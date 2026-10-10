# ADR 0010: Password hashing in the authentication foundation

Status: Accepted following Phase 3 approval; implemented in the foundation.
Date: 2026-10-10.
Extends [ADR 0003](0003-authentication-and-tenancy.md).

## Context

The architecture requires library-owned password mechanisms and database sessions, with no homemade cryptography. Better Auth 1.7.7's default scrypt configuration uses N=16384, r=16, p=1. That work factor is below the current OWASP scrypt recommendation. The application already uses a supported Node server runtime; adding one maintained password-hashing dependency is preferable to weakening the requirement or inventing an encoder.

## Decision

Use Better Auth's documented password hash/verify hooks with pinned `@node-rs/argon2` 2.2.2. Use Argon2id v19, 32 MiB memory, three iterations and parallelism one. The library generates independent salts and encodes/verifies PHC strings; application code does not implement Argon2, salt generation, or constant-time digest comparison. These parameters meet an OWASP recommended Argon2id combination. Preserve library verification of legacy Better Auth scrypt hashes. Password change or operator reset replaces legacy hashes with Argon2id; login does not claim automatic rehashing.

Keep public signup disabled. Provision and recover users only with the documented operator command. Recovery revokes prior sessions; authenticated password change requires a fresh session, same-origin and session-bound CSRF proof. No SMTP service or public reset endpoint is invented.

## Alternatives

- Keep the default scrypt configuration: fewer dependencies, but insufficient chosen work factor.
- Increase scrypt parameters: possible, but Argon2id is preferred and has a supported maintained implementation.
- Implement encoding or hashing primitives locally: rejected for correctness and maintenance.
- Hosted authentication: adds a core external dependency contrary to the approved local foundation.

## Consequences

Native prebuilt library support must be verified for each deployment platform. Hashing consumes approximately 32 MiB per concurrent operation, so persisted request limits bound resource use. Both current and legacy verification paths need tests. Hashes, credentials and session tokens remain private database data and are excluded from DTOs/logs.

Better Auth credential/session operations and the subsequent append-only authentication audit insert are sequential operations through supported APIs and separate database pools. A failed auth audit write is logged with safe identifiers and does not discard the already committed success or its cookies. Failed audit delivery is not durably retried by this foundation. This foundation does not claim atomic credential/audit writes; future stronger delivery guarantees must use a reviewed library-supported transaction or durable integration. Tenant preference mutations and their audit write are one transaction.

## Validation

Unit tests verify independent salts, encoded algorithm/version/work factors, correct/incorrect verification and a legacy scrypt fixture. Real PostgreSQL integration checks provision/login, password change, recovery, revocation, hard expiry, safe DTOs and audit immutability. Clean installation and build validate the native package for this environment; see [scaffold validation](../scaffold-validation.md).

## References

- [Better Auth password hooks](https://www.better-auth.com/docs/authentication/email-password)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [node-rs Argon2 implementation](https://github.com/napi-rs/node-rs/tree/main/packages/argon2)
