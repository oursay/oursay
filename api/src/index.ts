// @oursay/api public surface. The service layer is the durable core — importable from tests, the
// CLI, or other packages without spinning up HTTP. `buildServer` is one consumer among several.

// Composition + infrastructure
export { Db } from "./db.js";
export { buildServices } from "./container.js";
export type { BuildOptions, Repos, Services } from "./container.js";
export { buildServer } from "./http/server.js";
export type { BuildServerOptions } from "./http/server.js";

// Services
export { AuthService } from "./services/auth.service.js";
export type { AuthServiceDeps, IssuedSession, SessionScope } from "./services/auth.service.js";
export { OtpService } from "./services/otp.service.js";
export type { OtpServiceDeps, VerifiedEmail } from "./services/otp.service.js";
export { RegistrationService } from "./services/registration.service.js";
export type { RegisterInput, RegisterResult, RegistrationProfileInput } from "./services/registration.service.js";
export { PasskeyService } from "./services/passkey.service.js";
export type { PasskeyLoginResult, PasskeyServiceDeps } from "./services/passkey.service.js";
export { RecoveryService } from "./services/recovery.service.js";
export type { RecoveryVerifyResult } from "./services/recovery.service.js";
export { MailerService, createMailerService } from "./services/mailer/mailer.js";
export type { MailAdapter, MailMessage, MailRole } from "./services/mailer/mailer.js";
export { NoopMailAdapter } from "./services/mailer/adapters/noop.js";

// Repos (handy for admin tooling / tests)
export { UserRepo } from "./repo/user.repo.js";
export { ProfileRepo } from "./repo/profile.repo.js";
export { PasskeyRepo } from "./repo/passkey.repo.js";
export { SessionRepo } from "./repo/session.repo.js";
export { OtpRepo } from "./repo/otp.repo.js";
export { RateLimitRepo } from "./repo/ratelimit.repo.js";
export { KycRepo } from "./repo/kyc.repo.js";

// Errors + config
export { ServiceError, isServiceError, systemNow } from "./errors.js";
export type { ErrorCode, Now } from "./errors.js";
export * as config from "./config.js";
