# Authentication and security problems

Reviewed **26 October 2026** for Phase 19 Checkpoint 4 against committed Checkpoint 3 `45ab9db8991af4d714e2bfb3a5a4053cd59dfaf2` and application baseline `5132900a03efabaeb307787531546987228220e7`. The procedures below are **Source-reviewed**. Existing [authentication tests](../../tests/integration/auth.test.ts), [security review](../security.md) and [FA-03 remediation](../audit-remediation.md) provide **Historically passed** evidence; see [checkpoint verification](verification.md) for fresh reproduction and its limits.

Use this guide after confirming the application is reachable. [Installation/startup troubleshooting](installation-and-startup.md) covers an unreachable process; [diagnostics](diagnostics.md) owns log/status commands and sanitized evidence collection. The [user manual](../user-guide/settings-and-navigation.md) owns normal sign-in and workspace steps.

## Sign-in rejects credentials or the account has never been provisioned

**Problem:** The application cannot authenticate the supplied identity.

**Symptoms:** The sign-in form shows **Unable to sign in. Check your email and password and try again.** A rejected gateway request can carry `AUTH_FAILED` and **The request could not be authenticated.** The form deliberately does not disclose whether an email exists. Invalid form input instead shows **Enter a valid email address.** or **Enter your password, up to 128 characters.**

**Possible causes:** A mistyped email/password; an identity provisioned on another installation; no owner bootstrap; a previously reset password; or an authentication/database failure that needs a request-ID investigation. Public registration is disabled. Repeating initial bootstrap for an existing account preserves credentials; it does not change a forgotten password.

**Diagnosis:**

1. Confirm the application address and deployment/release with the operator. Compare the sign-in request's status/code in the browser Network panel; record the request ID, not its request body or cookies.
2. Recheck the provisioned email and the two field-level validation messages. Password creation/recovery requires 12–128 characters; existing sign-in accepts the current password up to 128 characters.
3. Ask the operator to check the original provisioning outcome without disclosing the password. Use [database diagnostics](database-and-migrations.md) if the auth service/database is unavailable. A generic failure message alone does not establish incorrect credentials.

**Resolution:**

1. Correct a confirmed input/address mistake, then submit once. If a rate-limit message appears, follow the next issue before retrying.
2. If no identity exists, an authorized operator follows [owner provisioning](../getting-started/installation.md) on the intended migrated installation. Creating a separate identity does not recover another user's workspace.
3. For confirmed forgotten credentials, use the supported operator recovery path described below. Do not insert credentials/hashes directly into the database or enable public signup.

**Verification:** Successful sign-in opens Overview with the expected workspace membership. Confirm a read of existing authorized records; a successful sign-in must not create replacement financial records.

**Escalation:** Collect the application commit, time/timezone, sanitized origin, request status/code/request ID, whether owner provisioning previously succeeded, and whether other identities can authenticate. Do not share an email/password pair, cookies, password hashes or raw bootstrap output containing private details.

Evidence: [sign-in form](../../apps/web/src/components/sign-in-form.tsx), [gateway](../../packages/server/src/auth-gateway.ts), [authentication configuration](../../packages/server/src/auth.ts) and `bootstrapOwner` in [server services](../../packages/server/src/services.ts).

## Too many attempts or credential service is briefly busy

**Problem:** Sign-in or password work is rejected with HTTP `429`.

**Symptoms:** The form shows **Too many attempts. Please wait before trying again.** Gateway problem code is `RATE_LIMITED`, with **Wait before trying again.** Its `Retry-After` can be `900` seconds for the identity window or `1` second when credential admission is full.

**Possible causes:** The same normalized email exceeded its persisted allowance of 10 admitted login attempts in a 15-minute fixed window; or four credential handlers are already active in that gateway process. Identity counters are shared through PostgreSQL; restarting one replica does not reset them. Client-supplied forwarding/IP headers are discarded and are not a supported identity-selection mechanism.

**Diagnosis:**

1. Read status and numeric `Retry-After` from one rejected request. Record when it occurred; do not keep generating attempts as a health check.
2. Check whether a monitor, password manager, script or duplicate tab is repeatedly submitting for the same identity.
3. The operator checks safe authentication/gateway events and service/database health through [diagnostics](diagnostics.md). A `429` affecting one identity does not establish an installation-wide outage.

**Resolution:**

1. Stop automated/repeated submissions and wait for the indicated retry interval. For the persisted window, account for the original window start rather than assuming a process restart clears it.
2. Correct credentials before one deliberate retry. Use the recovery path if the correct password is unknown.
3. If short busy responses persist, have the operator investigate process/DB capacity and abusive workload. Preserve the bounded admission and identity limits; do not disable them, clear rate-limit rows manually or spoof headers.

**Verification:** A valid provisioned identity can sign in after its window/admission condition clears. Repeated broad-load or attack testing belongs in an isolated test environment, not a live user installation.

**Escalation:** Provide the status/code, safe request IDs, numeric retry interval, approximate attempt rate, affected scope and time window. Keep normalized-email hashes/counter contents private. [FA-03](../audit-remediation.md) and the [authentication tests](../../tests/integration/auth.test.ts) cover unrelated-user availability, persisted limits and bounded expiry cleanup; these historical tests do not establish production capacity.

## A session disappears, expires or needs a recent sign-in

**Problem:** A previously authenticated operation now requires authentication or a newer session.

**Symptoms:** Protected pages return to `/sign-in`; API requests return `401 UNAUTHENTICATED` with **Sign in to continue.** Security APIs can return `403 REAUTHENTICATION_REQUIRED` and **A recent sign-in is required for account security changes.** The session-read endpoint returns a safe session DTO or `null`, not an authentication token.

**Possible causes:** Sessions have a seven-day hard expiry with refresh disabled; explicit sign-out/revocation; password change/operator recovery; a different browser/host; Secure-cookie delivery through an incorrect HTTP/HTTPS origin; or changed authentication-secret/configuration context. Security session listing, password change and revocation require a sign-in newer than five minutes; sign-out does not have that freshness gate.

**Diagnosis:**

1. Preserve unsaved text privately before navigation. Record the rejected operation and time.
2. Inspect only whether the session-read response is present/absent and whether the request used the canonical host/protocol. Do not copy its identity details, CSRF header or cookies into a support report.
3. Ask whether the operator recently recovered a password, rotated the auth secret or restored a database. A readable old page is not proof that its session remains valid.

**Resolution:**

1. Sign in again at the configured application address. Use the browser's normal top-level application, rather than an embedded or alternative-host copy.
2. For a financial write whose response was interrupted, inspect persisted evidence before resubmitting. Use an offered identical retained retry where available; signing in again does not prove that the prior write failed.
3. If the session repeatedly disappears, have the operator verify origin/proxy/cookie configuration using the next issue and [configuration](../getting-started/configuration.md). Do not weaken HttpOnly, SameSite or Secure-cookie attributes.

**Verification:** A fresh sign-in yields the expected workspace list and authorized read. An API-only security operation succeeds only with its required recent session and mutation proof. There is no browser session-manager/password-change page in the delivered UI.

**Escalation:** Record sign-in time, expiration/revocation timing, canonical origin, operation/status/code and request IDs; note recent secret/recovery/deployment changes without supplying secret values. Evidence: [authentication configuration](../../packages/server/src/auth.ts), [gateway freshness check](../../packages/server/src/auth-gateway.ts) and [session tests](../../tests/integration/auth.test.ts).

## A write is rejected by Origin or CSRF checks

**Problem:** The server cannot establish that a mutation belongs to this application and session.

**Symptoms:** `403 UNTRUSTED_ORIGIN` says **The request must originate from this application.** `403 INVALID_CSRF` says **Refresh the page and retry the request.** Portability may show **Refresh your session before continuing.** when it cannot obtain the session proof.

**Possible causes:** The request's `Origin` differs from the exact configured `APP_ORIGIN`; it has a cross-site fetch classification; the client used a second hostname/protocol/port; a proxy rewrote the intended origin; or a mutation has an absent/stale/wrong-session `x-csrf-token`. Session cookies alone do not supply the CSRF proof. A new session produces a different proof.

**Diagnosis:**

1. Compare the browser address and nonsecret request `Origin` with the operator-confirmed `APP_ORIGIN`, including scheme and port. `localhost` and `127.0.0.1` are different origins.
2. Record the problem code and request ID. Inspect whether the client fetched `/api/auth/session` before the write and whether a proof header was present; do not export its value.
3. Check [configuration precedence](../getting-started/configuration.md), process restart history and deployment proxy settings. Do not use an unrelated test browser session or copied CSRF proof to diagnose a live account.

**Resolution:**

1. Preserve unsaved notes and inspect the outcome of any uncertain financial command. Return to the canonical application address and sign in if required.
2. Refresh to obtain current application/session state, then use the supported form's retained retry when appropriate. An authorized integration must obtain the proof from its own session and send the correct same-origin request.
3. If deployment configuration is wrong, the operator corrects the reviewed origin/proxy setting and restarts affected processes under the [configuration guide](../getting-started/configuration.md). Never remove Origin/CSRF validation or allow an arbitrary origin to conceal the failure.

**Verification:** The same supported form succeeds under the canonical origin and valid session/proof. A wrong-origin or missing-proof request remains rejected; a successful fix must preserve that boundary.

**Escalation:** Provide sanitized origin values, HTTP method and route template, status/code/request ID, and whether proof acquisition succeeded. Exclude raw request headers, cookies, CSRF values, request bodies and browser HAR/trace files unless separately sanitized. Evidence: [security checks](../../packages/server/src/security.ts), [auth gateway](../../packages/server/src/auth-gateway.ts), [client](../../apps/web/src/lib/api-client.ts) and [authentication tests](../../tests/integration/auth.test.ts).

## The user can sign in but cannot see or change a workspace record

**Problem:** Authentication succeeds but the selected resource/action is outside current membership or role.

**Symptoms:** `403 FORBIDDEN` can state **Your workspace role does not permit this action.** A missing or inaccessible workspace/resource can return `404 NOT_FOUND`, **The requested resource is unavailable.** The UI may show **No workspace has been assigned. Contact your workspace administrator to request access.** Complete backup/restore displays owner-access guidance for nonowners.

**Possible causes:** The wrong workspace/query/bookmark; a removed membership; viewer access to an editor task; editor access to owner preferences/archive/restore; or a foreign resource ID. Membership is rechecked during the tenant transaction rather than trusted indefinitely. A `404` deliberately does not disclose another workspace's existence.

**Diagnosis:**

1. Select the intended workspace through Overview and check its sidebar name. Confirm whether it is a demo workspace.
2. Compare the task's required role with [manual roles](../user-guide/settings-and-navigation.md#choose-a-workspace-and-understand-roles). Ownership of a different workspace does not transfer permissions.
3. Record whether an authorized read works and which one action fails. Use current UI/API evidence, not a guessed database ID, to identify the resource.

**Resolution:**

1. Correct a mistaken workspace selection or stale link.
2. Have the installation administrator review legitimately required membership/role through the supported administrative integration/process. There is no delivered invitation or role-editor page to click.
3. Preserve authorization and RLS. Do not assign a runtime DB role superuser/BYPASSRLS, edit authoritative data or share another user's cookies to gain access.

**Verification:** The user can read only their authorized workspaces and perform only the intended role's task; unrelated workspace access remains denied. If records are still absent, investigate filters and source history using [financial troubleshooting](financial-discrepancies.md) rather than assuming deletion.

**Escalation:** Collect the user's intended role, affected route/action, sanitized workspace alias, status/code and request IDs. Share actual actor/workspace IDs only through an authorized private support channel. Evidence: `authorizeWorkspace`/`withWorkspaceContext` in [server services](../../packages/server/src/services.ts), [portability role checks](../../packages/server/src/portability/api.ts) and [authentication isolation tests](../../tests/integration/auth.test.ts).

## The page fails to hydrate or a browser security policy blocks content

**Problem:** A supported page does not initialize, or the browser blocks framing/scripts under the application's policy.

**Symptoms:** Browser Console or Network identifies a Content Security Policy violation, blocked frame or failed script. Browser wording varies; there is no single invented Trading Journal error string for this condition.

**Possible causes:** Attempted embedding/framing; an extension/injected script; altered proxy/cache headers; a document's nonce/policy no longer matching its response; unavailable static assets; or a release that mixes HTML and assets. The [proxy](../../apps/web/src/proxy.ts) creates a fresh nonce, sets the request CSP for Next hydration and replaces forged incoming nonce/policy headers. Framework static assets have their own routing/cache boundary.

**Diagnosis:**

1. Open the canonical application as a top-level page. Capture only the directive/resource category and HTTP status from Console/Network, not complete private page content or headers.
2. Test a clean browser profile with no extensions against the same reviewed release. Inspect static-asset status and whether the deployment edge caches/transforms private document responses.
3. The operator compares actual response policy with [browser-security implementation](../../apps/web/src/lib/browser-security.ts) and [deployment](../deployment.md), using restricted diagnostics. API/file sandbox policies are not expected to allow interactive HTML.

**Resolution:**

1. Stop unsupported embedding/injection and correct mixed/failed static-asset deployment through the release procedure.
2. Correct an edge rule that alters nonce-bearing application documents or security headers, preserving private response behavior and the application-generated policy.
3. Escalate a reproduced first-party hydration failure. Do not add wildcard script origins, disable CSP, make attachments public or turn off browser security to hide it.

**Verification:** A clean top-level page hydrates and supports a representative authorized read; the [browser-security regression](../../tests/e2e/browser-security.spec.ts) still blocks untrusted scripts/framing. Selected passing tests do not certify all browser extensions/proxies.

**Escalation:** Supply release/browser version, top-level versus embedded context, safe failed directive/resource category, resource status and reproducibility in a clean profile. Screenshots must omit financial data and identity. Do not submit a raw browser trace/HAR as a public issue.

## Forgotten password requires an operator recovery

**Problem:** The provisioned user cannot recover access through the browser.

**Symptoms:** The delivered sign-in page has no public signup/reset workflow. An unsupported public auth route may return `NOT_FOUND`; that is not evidence that the private recovery mechanism is missing.

**Possible causes:** Lost credentials or a password mismatch. Initial owner bootstrap is intentionally distinct from reset: an existing account must authenticate before bootstrap can repair an interrupted personal-workspace setup.

**Diagnosis:** Confirm the target installation, provisioned identity and authorized operator through an established private process. Separate missing membership from a missing password. Preserve incident evidence if compromise is suspected.

**Resolution:**

1. The authorized operator uses the supported one-shot recovery below, with the intended private configuration and authentication DB described in [configuration](../getting-started/configuration.md). This changes credentials and revokes every prior session; coordinate the interruption with the user.
2. From repository root, the supported command is shown below. It is **state-changing**, **Source-reviewed**, and **Not run as a recovery rehearsal in this guide**. It comes from [the root script](../../package.json) and [create-user](../../scripts/create-user.ts), not a generic SQL recipe. Replace the fictional address with the confirmed identity. In a trusted interactive TTY it prompts invisibly; automation must use a secure `BOOTSTRAP_PASSWORD` binding, never a literal command-line password.

   ```bash
   corepack pnpm user:create --email owner@example.test --reset-password
   ```

3. Keep the new password private, check the exact target and retain the operator audit evidence. A nonexistent identity is not created by this recovery path. A potentially destructive full-system recovery requires a preserved coordinated backup first; a password problem alone does not justify database restore or data deletion.

**Verification:** The command's successful output is **Password recovered. All prior sessions were revoked.** The user signs in with the new password and sees their existing authorized records; prior sessions no longer authorize requests. The [offline recovery integration test](../../tests/integration/auth.test.ts) is historical evidence, not a new production recovery claim.

**Escalation:** Collect the sanitized command outcome, target release, time, whether identity lookup/provisioning was established and safe auth audit/request identifiers. CLI reporting can deliberately hide underlying details. Never share `BOOTSTRAP_PASSWORD`, password hashes, reset tokens, raw auth rows or protected environment files.
