// Composition root: build the repo + service graph from a Db. Used by the HTTP server, the CLI, and
// tests alike, so all three exercise the same service layer. Services are the durable core; HTTP is
// just one consumer.

import {
  mailerConfig,
  otpConfig,
  registrationConfig,
  sessionConfig,
  type MailerVendor,
} from "./config.js";
import type { Db } from "./db.js";
import { systemNow, type Now } from "./errors.js";
import { KycRepo } from "./repo/kyc.repo.js";
import { OtpRepo } from "./repo/otp.repo.js";
import { PasskeyRepo } from "./repo/passkey.repo.js";
import { ProfileRepo } from "./repo/profile.repo.js";
import { RateLimitRepo } from "./repo/ratelimit.repo.js";
import { SessionRepo } from "./repo/session.repo.js";
import { UserRepo } from "./repo/user.repo.js";
import { AuthService } from "./services/auth.service.js";
import { createMailerService, type MailAdapter, type MailerService } from "./services/mailer/mailer.js";
import { OtpService } from "./services/otp.service.js";
import { PasskeyService } from "./services/passkey.service.js";
import { RecoveryService } from "./services/recovery.service.js";
import { RegistrationService } from "./services/registration.service.js";

export interface BuildOptions {
  /** Injectable clock for deterministic tests. */
  now?: Now;
  /** Inject fixture mailer adapters (e.g. a NoopMailAdapter you hold a handle to). */
  mailerOverrides?: Partial<Record<MailerVendor, MailAdapter>>;
  /** Override an already-built mailer entirely. */
  mailer?: MailerService;
}

export interface Repos {
  user: UserRepo;
  profile: ProfileRepo;
  passkey: PasskeyRepo;
  session: SessionRepo;
  otp: OtpRepo;
  rateLimit: RateLimitRepo;
  kyc: KycRepo;
}

export interface Services {
  db: Db;
  repos: Repos;
  mailer: MailerService;
  otpService: OtpService;
  authService: AuthService;
  registrationService: RegistrationService;
  passkeyService: PasskeyService;
  recoveryService: RecoveryService;
}

export async function buildServices(db: Db, opts: BuildOptions = {}): Promise<Services> {
  const now: Now = opts.now ?? systemNow;
  const pool = db.pool;

  const repos: Repos = {
    user: new UserRepo(pool),
    profile: new ProfileRepo(pool),
    passkey: new PasskeyRepo(pool),
    session: new SessionRepo(pool),
    otp: new OtpRepo(pool),
    rateLimit: new RateLimitRepo(pool),
    kyc: new KycRepo(pool),
  };

  const mailer = opts.mailer ?? (await createMailerService(mailerConfig, opts.mailerOverrides));

  const authService = new AuthService({ sessionRepo: repos.session, config: sessionConfig, now });
  const otpService = new OtpService({
    otpRepo: repos.otp,
    rateLimitRepo: repos.rateLimit,
    mailer,
    config: otpConfig,
    pepper: sessionConfig.secret,
    now,
  });
  const registrationService = new RegistrationService({
    userRepo: repos.user,
    profileRepo: repos.profile,
    otpService,
    authService,
    config: registrationConfig,
    now,
  });
  const passkeyService = new PasskeyService({
    passkeyRepo: repos.passkey,
    profileRepo: repos.profile,
    authService,
    now,
  });
  const recoveryService = new RecoveryService({
    otpService,
    profileRepo: repos.profile,
    kycRepo: repos.kyc,
    authService,
    now,
  });

  return { db, repos, mailer, otpService, authService, registrationService, passkeyService, recoveryService };
}
