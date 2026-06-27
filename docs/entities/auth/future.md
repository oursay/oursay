# Auth — future / deferred

Deferred design intent for the `auth/` entities (session, passkey-credential, email-otp). Not shipped; see each entity's **Gaps** for the matching code-alignment prompt.

## Registration scope
OTP registration should yield a limited **`registration`** session scope that may enroll the **first** passkey only; a `full` session is issued only **after** the user logs in with that passkey. Today `RegistrationService` issues `full` directly (`api/src/services/registration.service.ts`), so a freshly registered account can take full civic action before any passkey exists.
→ `.agents/CODE-ALIGNMENT-PROMPTS.md` `[code-registration-scope]`.

## Passkey per authenticator
Target: one account-login passkey per **enrolled authenticator** (device/security key); a user may enroll several across devices. Add-device and recovery flows already exist; this is a constraint/UX clarification.
