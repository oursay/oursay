// Composition root: build the repo + service graph from a Db. Used by the HTTP server, the CLI, and
// tests alike, so all three exercise the same service layer. Services are the durable core; HTTP is
// just one consumer.

import {
  IdentityRegistry,
} from "@oursay/identity/server";
import { GeoStore, RegionResolver } from "@oursay/geo";
import { jurisdictions } from "@oursay/jurisdiction-data";
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
  kycConfig,
  mailerConfig,
  otpConfig,
  pgConfig,
  registrationConfig,
  sessionConfig,
  type KycConfig,
  type MailerVendor,
} from "./config.js";
import type { Db } from "./db.js";
import { systemNow, type Now } from "./errors.js";
import { CivicDeviceRepo } from "./repo/civic-device.repo.js";
import { GeocodeRepo } from "./repo/geocode.repo.js";
import { KycRepo } from "./repo/kyc.repo.js";
import { KycSessionRepo } from "./repo/kyc-session.repo.js";
import { MembershipRepo } from "./repo/membership.repo.js";
import { SigningPrefsRepo } from "./repo/signing-prefs.repo.js";
import { OtpRepo } from "./repo/otp.repo.js";
import { PasskeyRepo } from "./repo/passkey.repo.js";
import { ProfileRepo } from "./repo/profile.repo.js";
import { RateLimitRepo } from "./repo/ratelimit.repo.js";
import { SessionRepo } from "./repo/session.repo.js";
import { UserRepo } from "./repo/user.repo.js";
import { AreaCatalogService } from "./services/area-catalog.service.js";
import { AuthService } from "./services/auth.service.js";
import { CivicDeviceService } from "./services/civic-device.service.js";
import { CivicRecordService } from "./services/civic-record.service.js";
import { GateService } from "./services/gate.service.js";
import { GeocodeService } from "./services/geocode.service.js";
import { makeGeocodeProvider, type GeocodeProvider } from "./services/geocode/index.js";
import { KycService } from "./services/kyc.service.js";
import { KycSessionService } from "./services/kyc-session.service.js";
import { makeKycProviderStack, type KycProvider } from "./services/kyc/index.js";
import { LoginService } from "./services/login.service.js";
import { createMailerService, type MailAdapter, type MailerService } from "./services/mailer/mailer.js";
import { OtpService } from "./services/otp.service.js";
import { IdentityReadService } from "./services/identity-read.service.js";
import { ParticipantGeoService } from "./services/participant-geo.service.js";
import { PasskeyService } from "./services/passkey.service.js";
import { PublicFeedService } from "./services/public-feed.service.js";
import { PublicRecordReadService } from "./services/public-record-read.service.js";
import { RecordDetailService } from "./services/record-detail.service.js";
import { RecordStateService } from "./services/record-state.service.js";
import { PersonaPageService } from "./services/persona-page.service.js";
import { OfficialPageService } from "./services/official-page.service.js";
import { ProfilePageService } from "./services/profile-page.service.js";
import { RecoveryService } from "./services/recovery.service.js";
import { RegistrationService } from "./services/registration.service.js";
import { ViewerContextService } from "./services/viewer-context.service.js";

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
  /** Override the KYC provider config. Tests inject an explicit provider (stub, or a real didit
   *  config) so the suite never depends on the ambient KYC_PROVIDER a developer set for a live walk.
   *  Defaults to the process-wide kycConfig. */
  kyc?: KycConfig;
}

export interface Repos {
  user: UserRepo;
  profile: ProfileRepo;
  passkey: PasskeyRepo;
  session: SessionRepo;
  otp: OtpRepo;
  rateLimit: RateLimitRepo;
  kyc: KycRepo;
  kycSession: KycSessionRepo;
  civicDevice: CivicDeviceRepo;
  geocode: GeocodeRepo;
  /** Jurisdiction subscriptions + the platform-assigned official role ([mvp-c10b-membership]). */
  membership: MembershipRepo;
  /** Per-action signing preferences (C1); floors stay enforced server-side regardless. */
  signingPrefs: SigningPrefsRepo;
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
  /** Pluggable KYC verification provider (stub by default; equifax reserved). */
  kycProvider: KycProvider;
  /** Issues verification attestations (provider -> kyc_attestations); single entry point for KYC. */
  kycService: KycService;
  /** Hosted KYC session orchestration (Didit when KYC_PROVIDER=didit). */
  kycSessionService: KycSessionService;
  passkeyService: PasskeyService;
  recoveryService: RecoveryService;
  loginService: LoginService;
  civicDeviceService: CivicDeviceService;
  /** Per-action jurisdiction act-gate resolution (tiers / residency / role / deny). */
  gateService: GateService;
  civicRecordService: CivicRecordService;
  /** PostGIS geo store (district boundaries + Region.contains). One process-lived instance. */
  geoStore: GeoStore;
  /** Builds Regions from coarse scopes (compileScope seam the C7 public read filter will consume). */
  regionResolver: RegionResolver;
  /** PRIVATE bridge: civic participant -> userId -> current point -> containing district revision. */
  participantGeoService: ParticipantGeoService;
  /** Unauthenticated public READ surface over the civic record (browse/detail/counts). */
  publicRecordReadService: PublicRecordReadService;
  /** Resolves the optional authenticated viewer into read-resolution context ([align-w4] P1–P9). */
  viewerContextService: ViewerContextService;
  /** Viewer-dependent author identity + authorGeo resolution for served DTOs (C4/C6/C7 port). */
  identityReadService: IdentityReadService;
  /** The unified, viewer-optional public feed (P1). */
  publicFeedService: PublicFeedService;
  /** Viewer-aware, kind-agnostic record detail + comment thread (P2/P3). */
  recordDetailService: RecordDetailService;
  /** Self-only batch read of viewer participation markers (A5). */
  recordStateService: RecordStateService;
  /** Thread-scoped persona profile surface (P6). */
  personaPageService: PersonaPageService;
  /** Auto-generated official seat pages (jurisdiction leaders; MLA catalog later). */
  officialPageService: OfficialPageService;
  /** Account-level public profile surface (P4/P5). */
  profilePageService: ProfilePageService;
  /** Unauthenticated public AREA CATALOG (jurisdiction index + effective-dated district directory +
   *  official boundary geometry). Official electoral boundaries only — no private points. */
  areaCatalogService: AreaCatalogService;
  /** The public-record private store backing the civic engine (read access for tests/projections). */
  recordStore: PrivateStore;
}

export async function buildServices(db: Db, opts: BuildOptions = {}): Promise<Services> {
  const now: Now = opts.now ?? systemNow;
  const pool = db.pool;

  // Register EVERY configured jurisdiction (from @oursay/jurisdiction-data) in the public-record router
  // so civic governance rules + privacy floor + count-exposure policy resolve per thread, not just for
  // the deployment default. Done here — the composition root — so HTTP, CLI, and tests all share it.
  // Env (`JURISDICTION_ID`) only selects the DEFAULT id; the rules live in the data package. The env
  // `jurisdictionConfig` is registered only as a fallback when it names an id the data package doesn't
  // ship (so a deployment can still point at a not-yet-packaged jurisdiction without clobbering data rules).
  for (const j of jurisdictions) registerJurisdiction(j);
  if (!jurisdictions.some((j) => j.id === jurisdictionConfig.id)) registerJurisdiction(jurisdictionConfig);

  const repos: Repos = {
    user: new UserRepo(pool),
    profile: new ProfileRepo(pool),
    passkey: new PasskeyRepo(pool),
    session: new SessionRepo(pool),
    otp: new OtpRepo(pool),
    rateLimit: new RateLimitRepo(pool),
    kyc: new KycRepo(pool),
    kycSession: new KycSessionRepo(pool),
    civicDevice: new CivicDeviceRepo(pool),
    geocode: new GeocodeRepo(pool),
    membership: new MembershipRepo(pool),
    signingPrefs: new SigningPrefsRepo(pool),
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
    membershipRepo: repos.membership,
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

  // Geo: ONE process-lived GeoStore (its own small pool, mirroring recordStore) — the schema is
  // already ensured by Db.init(), so we don't re-init or close it here. RegionResolver is the
  // compileScope seam the public read filter consumes; ParticipantGeoService is the PRIVATE bridge
  // (participant -> point -> district revision) the count filter resolves membership through.
  const geoStore = new GeoStore(pgConfig);
  const regionResolver = new RegionResolver({ geoStore });
  const participantGeoService = new ParticipantGeoService({
    recordStore,
    geocodeRepo: repos.geocode,
    geoStore,
  });

  // KYC: pluggable provider (stub by default; didit/equifax) + session orchestration + attestations.
  const kycStack = makeKycProviderStack(opts.kyc ?? kycConfig);
  const kycProvider = kycStack.provider;
  const kycService = new KycService({ provider: kycProvider, recordStore, kycRepo: repos.kyc });
  const kycSessionService = new KycSessionService({
    sessionProvider: kycStack.sessionProvider,
    kycService,
    sessionRepo: repos.kycSession,
    participantGeoService,
    diditProvider: kycStack.diditProvider,
  });

  // Per-action jurisdiction gates ([align-w3-gates-schema]) + the civic write service. Built here —
  // after kyc/participant-geo — because gate resolution needs the caller's CURRENT tier, point, and
  // role, and the write path projects the C6 relationship snapshot through the same seams.
  const gateService = new GateService({ kycService, participantGeoService, membershipRepo: repos.membership });
  const civicRecordService = new CivicRecordService({
    registry: identityRegistry,
    store: recordStore,
    gateService,
    kycService,
    participantGeoService,
    regionResolver,
    geoStore,
  });

  // The public read surface resolves geo `scope` AND KYC `tier` on the count endpoints: regionResolver +
  // participantGeoService (region-first, current-point mode) for geo, and KycRepo (current tier, set
  // membership) for tier, with a k-anonymity floor when either dimension narrows. Date stays stubbed.
  const publicRecordReadService = new PublicRecordReadService({
    recordStore,
    regionResolver,
    participantGeoService,
    kycRepo: repos.kyc,
    gateService,
  });

  // [align-w4-api-surface] viewer-optional read resolution: the viewer context (tier/role/home
  // seats), the author identity + authorGeo resolution every served DTO passes through (the
  // server-side port of the web-app read-model — C4/C6/C7), and the unified feed over both.
  const viewerContextService = new ViewerContextService({
    userRepo: repos.user,
    profileRepo: repos.profile,
    kycRepo: repos.kyc,
    membershipRepo: repos.membership,
    participantGeoService,
    geoStore,
    jurisdictions: [...jurisdictions],
  });
  const identityReadService = new IdentityReadService({
    recordStore,
    userRepo: repos.user,
    profileRepo: repos.profile,
    kycRepo: repos.kyc,
    membershipRepo: repos.membership,
    participantGeoService,
    geoStore,
    jurisdictions: [...jurisdictions],
  });
  const publicFeedService = new PublicFeedService({ recordStore, identityReadService });
  const recordDetailService = new RecordDetailService({ recordStore, identityReadService });
  const recordStateService = new RecordStateService({ recordStore });
  const personaPageService = new PersonaPageService({ recordStore, identityReadService });
  const profilePageService = new ProfilePageService({
    recordStore,
    userRepo: repos.user,
    profileRepo: repos.profile,
    kycRepo: repos.kyc,
    membershipRepo: repos.membership,
    geoStore,
    identityReadService,
    publicFeedService,
  });
  const officialPageService = new OfficialPageService({ geoStore, profilePageService });

  // Public area catalog: thin read surface over GeoStore + the registered jurisdiction configs
  // (same `jurisdictions` list registered above). Official electoral boundaries only.
  const areaCatalogService = new AreaCatalogService({ geoStore, jurisdictions });

  return {
    db,
    repos,
    mailer,
    otpService,
    authService,
    registrationService,
    geocodeProvider,
    geocodeService,
    kycProvider,
    kycService,
    kycSessionService,
    passkeyService,
    recoveryService,
    loginService,
    civicDeviceService,
    gateService,
    civicRecordService,
    geoStore,
    regionResolver,
    participantGeoService,
    publicRecordReadService,
    viewerContextService,
    identityReadService,
    publicFeedService,
    recordDetailService,
    recordStateService,
    personaPageService,
    officialPageService,
    profilePageService,
    areaCatalogService,
    recordStore,
  };
}
