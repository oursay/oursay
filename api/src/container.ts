// Composition root: build the repo + service graph from a Db. Used by the HTTP server, the CLI, and
// tests alike, so all three exercise the same service layer. Services are the durable core; HTTP is
// just one consumer.

import {
  IdentityRegistry,
} from "@oursay/identity/server";
import {
  PrivateStore,
  PublicChain,
  RecordService,
  registerJurisdiction,
} from "@oursay/public-record";
import {
  civicConfig,
  geocodeConfig,
  jurisdictionConfig,
  mailerConfig,
  otpConfig,
  pgConfig,
  registrationConfig,
  sessionConfig,
  type MailerVendor,
} from "./config.js";
import type { Db } from "./db.js";
import { systemNow, type Now } from "./errors.js";
import { CivicDeviceRepo } from "./repo/civic-device.repo.js";
import { GeocodeRepo } from "./repo/geocode.repo.js";
import { KycRepo } from "./repo/kyc.repo.js";
import { OtpRepo } from "./repo/otp.repo.js";
import { PasskeyRepo } from "./repo/passkey.repo.js";
import { ProfileRepo } from "./repo/profile.repo.js";
import { RateLimitRepo } from "./repo/ratelimit.repo.js";
import { SessionRepo } from "./repo/session.repo.js";
import { UserRepo } from "./repo/user.repo.js";
import { AuthService } from "./services/auth.service.js";
import { CivicDeviceService } from "./services/civic-device.service.js";
import { CivicRecordService } from "./services/civic-record.service.js";
import { GeocodeService } from "./services/geocode.service.js";
import { makeGeocodeProvider, type GeocodeProvider } from "./services/geocode/index.js";
import { LoginService } from "./services/login.service.js";
import { createMailerService, type MailAdapter, type MailerService } from "./services/mailer/mailer.js";
import { OtpService } from "./services/otp.service.js";
import { PasskeyService } from "./services/passkey.service.js";
import { PublicRecordReadService } from "./services/public-record-read.service.js";
import { RecoveryService } from "./services/recovery.service.js";
import { RegistrationService } from "./services/registration.service.js";

export interface BuildOptions {
  /** Injectable clock for deterministic tests. */
  now?: Now;
  /** Inject fixture mailer adapters (e.g. a NoopMailAdapter you hold a handle to). */
  mailerOverrides?: Partial<Record<MailerVendor, MailAdapter>>;
  /** Override an already-built mailer entirely. */
  mailer?: MailerService;
  /** Override the platform binding private key (hex) — tests inject an ephemeral key per run so the
   *  registry's binding signature and the RecordService's verification share it. */
  platformBindingPrivKeyHex?: string;
}

export interface Repos {
  user: UserRepo;
  profile: ProfileRepo;
  passkey: PasskeyRepo;
  session: SessionRepo;
  otp: OtpRepo;
  rateLimit: RateLimitRepo;
  kyc: KycRepo;
  civicDevice: CivicDeviceRepo;
  geocode: GeocodeRepo;
}

export interface Services {
  db: Db;
  repos: Repos;
  mailer: MailerService;
  otpService: OtpService;
  authService: AuthService;
  registrationService: RegistrationService;
  /** Pluggable address->point geocoder (stub by default; geocodio behind env). */
  geocodeProvider: GeocodeProvider;
  /** Best-effort private geocoding of profile addresses (cache + append-only history). */
  geocodeService: GeocodeService;
  passkeyService: PasskeyService;
  recoveryService: RecoveryService;
  loginService: LoginService;
  civicDeviceService: CivicDeviceService;
  civicRecordService: CivicRecordService;
  /** Unauthenticated public READ surface over the civic record (browse/detail/counts). */
  publicRecordReadService: PublicRecordReadService;
  /** The public-record private store backing the civic engine (read access for tests/projections). */
  recordStore: PrivateStore;
}

export async function buildServices(db: Db, opts: BuildOptions = {}): Promise<Services> {
  const now: Now = opts.now ?? systemNow;
  const pool = db.pool;

  // Register the launch jurisdiction in the public-record router (idempotent) so civic governance
  // rules resolve. Done here — the composition root — so HTTP, CLI, and tests all share it.
  registerJurisdiction(jurisdictionConfig);

  const repos: Repos = {
    user: new UserRepo(pool),
    profile: new ProfileRepo(pool),
    passkey: new PasskeyRepo(pool),
    session: new SessionRepo(pool),
    otp: new OtpRepo(pool),
    rateLimit: new RateLimitRepo(pool),
    kyc: new KycRepo(pool),
    civicDevice: new CivicDeviceRepo(pool),
    geocode: new GeocodeRepo(pool),
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
  // Geocoding: pluggable provider (stub by default) + best-effort service over the cache/history repo.
  // Selected at startup so an invalid GEOCODE_PROVIDER (e.g. the reserved 'nominatim') fails fast here.
  const geocodeProvider = makeGeocodeProvider(geocodeConfig);
  const geocodeService = new GeocodeService({
    geocodeRepo: repos.geocode,
    provider: geocodeProvider,
    profileRepo: repos.profile,
  });
  const registrationService = new RegistrationService({
    userRepo: repos.user,
    profileRepo: repos.profile,
    otpService,
    authService,
    geocodeService,
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
  const loginService = new LoginService({
    otpService,
    profileRepo: repos.profile,
    passkeyRepo: repos.passkey,
    authService,
    now,
  });
  const civicDeviceService = new CivicDeviceService({ civicDeviceRepo: repos.civicDevice });

  // Civic record engine — reuse @oursay/public-record + @oursay/identity/server; no crypto here. The
  // production civic write path is webauthn-es256 (Option A): per-thread passkey assertions verified
  // by the RecordService, with the jurisdiction policy hard-requiring webauthn for vote/petition_signature.
  // `requireDeviceSigner` is retained only as a guard on the legacy p256 branch (a p256 envelope must
  // still carry a device signer); it does not gate the WebAuthn path. The SAME platform key signs
  // bindings (IdentityRegistry) and verifies them (RecordService). The store opens its own pool over the
  // same Postgres; its tables are created by Db.init() (PrivateStore.init).
  const platformBindingPrivKeyHex = opts.platformBindingPrivKeyHex ?? civicConfig.platformBindingPrivKeyHex;
  const recordStore = new PrivateStore(pgConfig);
  const recordSvc = new RecordService(new PublicChain(recordStore, civicConfig.chainId), recordStore, {
    platformBindingPrivKeyHex,
    requireDeviceSigner: true,
    signedEnvelopeMaxAgeSec: civicConfig.signedEnvelopeMaxAgeSec,
  });
  const identityRegistry = new IdentityRegistry({ store: recordStore, svc: recordSvc, platformBindingPrivKeyHex });
  const civicRecordService = new CivicRecordService({ registry: identityRegistry, store: recordStore });
  const publicRecordReadService = new PublicRecordReadService({ recordStore });

  return {
    db,
    repos,
    mailer,
    otpService,
    authService,
    registrationService,
    geocodeProvider,
    geocodeService,
    passkeyService,
    recoveryService,
    loginService,
    civicDeviceService,
    civicRecordService,
    publicRecordReadService,
    recordStore,
  };
}
