import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { ingestOfficialSeats, paths } from "@oursay/geo";
import { makeAccount } from "./helpers/account.js";
import { codeFromLastMail, resetWorld, type World } from "./helpers/world.js";

async function requestCode(
  w: World,
  email: string,
  profile: { handle: string; over18?: boolean; displayName?: string } = {
    handle: `@${email.split("@")[0]!.replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "user"}`,
    over18: true,
  },
): Promise<string> {
  const res = await w.app.inject({
    method: "POST",
    url: "/v1/auth/otp/request",
    payload: {
      email,
      purpose: "registration",
      profile: { over18: true, ...profile },
    },
  });
  expect(res.statusCode, res.body).to.equal(202);
  const body = res.json() as { status: string; expiresAt?: string };
  expect(body.expiresAt).to.be.a("string");
  expect(new Date(body.expiresAt!).getTime()).to.be.greaterThan(Date.now());
  return codeFromLastMail(w.mail, email);
}

describe("02 registration: OTP verify + slim profile → account + enroll-only session", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("registers with the least-resistance profile (handle + over-18) and returns a 'registration' session", async () => {
    const email = "newuser@example.com";
    const code = await requestCode(w, email, { handle: "@newuser" });
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { handle: "@newuser", over18: true } },
    });
    expect(res.statusCode).to.equal(201);
    const body = res.json();
    expect(body.userId).to.be.a("string");
    expect(body.session.token).to.be.a("string");
    // LIMITED enroll-only scope ([code-registration-scope]) — full access comes from passkey login.
    expect(body.session.scope).to.equal("registration");

    // The session authenticates /v1/auth/session (any active scope).
    const me = await w.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${body.session.token}` },
    });
    expect(me.statusCode).to.equal(200);
    expect(me.json().userId).to.equal(body.userId);

    // …but NOT full-scope routes.
    const blocked = await w.app.inject({
      method: "GET",
      url: "/v1/profile",
      headers: { authorization: `Bearer ${body.session.token}` },
    });
    expect(blocked.statusCode).to.equal(403);

    // Handle stored as wire username; displayName defaults to the handle body.
    const user = await w.services.repos.user.getById(body.userId);
    expect(user?.handle).to.equal("newuser");
    expect(user?.displayName).to.equal("newuser");
    // No DOB anywhere — just the self-attested flag; profile PII stays empty until volunteered.
    const profile = await w.services.repos.profile.getByUserId(body.userId);
    expect(profile?.over18).to.equal(true);
    expect(profile?.firstName).to.equal(null);
    expect(profile?.visibility).to.equal("anonymous");
    // Auto-subscribed to the universal record ([mvp-c10b-membership]).
    const memberships = await w.services.repos.membership.listForUser(body.userId);
    expect(memberships.map((m) => m.jurisdictionId)).to.deep.equal(["oursay-global"]);
  });

  it("verifies with email+code only when a server draft was stored at request", async () => {
    const email = "cross.session@example.com";
    const code = await requestCode(w, email, { handle: "@crosssession", displayName: "Cross Session" });
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code },
    });
    expect(res.statusCode, res.body).to.equal(201);
    const user = await w.services.repos.user.getById(res.json().userId);
    expect(user?.handle).to.equal("crosssession");
    expect(user?.displayName).to.equal("Cross Session");
  });

  it("409s when a second email tries to reserve a handle held by an active registration OTP", async () => {
    await requestCode(w, "first.hold@example.com", { handle: "@heldname" });
    const second = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: {
        email: "second.hold@example.com",
        purpose: "registration",
        profile: { handle: "@heldname", over18: true },
      },
    });
    expect(second.statusCode).to.equal(409);
    expect(second.json().error.code).to.equal("handle_taken");
  });

  it("resend without profile reuses the active draft for the same email", async () => {
    const email = "resend.draft@example.com";
    await requestCode(w, email, { handle: "@resenddraft" });
    w.mail.clear();
    const resend = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: { email, purpose: "registration" },
    });
    expect(resend.statusCode, resend.body).to.equal(202);
    const code = codeFromLastMail(w.mail, email);
    const verify = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code },
    });
    expect(verify.statusCode, verify.body).to.equal(201);
    const user = await w.services.repos.user.getById(verify.json().userId);
    expect(user?.handle).to.equal("resenddraft");
  });

  it("accepts optional PII behind the helper (name + address normalized onto the private profile)", async () => {
    const email = "eager@example.com";
    const profile = {
      handle: "@eager",
      displayName: "Eager Beaver",
      over18: true,
      firstName: "New",
      lastName: "User",
      address: { province: "AB", postalCode: "t2p1h9", country: "ca" },
    };
    const code = await requestCode(w, email, profile);
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile },
    });
    expect(res.statusCode).to.equal(201);
    const priv = await w.services.repos.profile.getByUserId(res.json().userId);
    expect(priv?.postalCode).to.equal("T2P 1H9");
    expect(priv?.province).to.equal("AB");
    expect(priv?.firstName).to.equal("New");
    expect(priv?.lastName).to.equal("User");
    const user = await w.services.repos.user.getById(res.json().userId);
    expect(user?.displayName).to.equal("Eager Beaver");
  });

  it("rejects a registration without a handle (schema-level)", async () => {
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email: "nohandle@example.com", code: "000000", profile: { over18: true } },
    });
    expect(res.statusCode).to.equal(400);
  });

  it("rejects a malformed handle", async () => {
    // Handle format is validated BEFORE the OTP is consumed, so no real code is needed (a dummy
    // code also keeps the per-run OTP-request rate limit from being burned on a validation case).
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email: "badhandle@example.com", code: "000000", profile: { handle: "@bad name", over18: true } },
    });
    expect(res.statusCode).to.equal(400);
    expect(res.json().error.code).to.equal("validation");
  });

  it("409s a handle that is already taken", async () => {
    const code1 = await requestCode(w, "first-handle@example.com", { handle: "@taken" });
    const first = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email: "first-handle@example.com", code: code1, profile: { handle: "@taken", over18: true } },
    });
    expect(first.statusCode).to.equal(201);

    // Handle uniqueness is checked BEFORE the OTP is consumed, so the duplicate 409s on a dummy code.
    const second = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email: "second-handle@example.com", code: "000000", profile: { handle: "@taken", over18: true } },
    });
    expect(second.statusCode).to.equal(409);
    expect(second.json().error.code).to.equal("handle_taken");
  });

  it("rejects a registrant who does not attest to being 18+", async () => {
    const email = "kid@example.com";
    const code = await requestCode(w, email, { handle: "@tooyoung" });
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { handle: "@tooyoung", over18: false } },
    });
    expect(res.statusCode).to.equal(403);
    expect(res.json().error.code).to.equal("age_restricted");
  });

  it("409s an already-registered email at otp/request (no wasted code)", async () => {
    const email = "dupe@example.com";
    const code = await requestCode(w, email, { handle: "@dupe" });
    const first = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { handle: "@dupe", over18: true } },
    });
    expect(first.statusCode).to.equal(201);

    // A second registration code for the same email is refused up front — no code is emailed.
    w.mail.clear();
    const second = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: { email, purpose: "registration", profile: { handle: "@dupe2", over18: true } },
    });
    expect(second.statusCode).to.equal(409);
    expect(second.json().error.code).to.equal("email_taken");
    expect(w.mail.outbox).to.have.length(0);
  });

  it("does not burn the OTP when registration fails the age gate", async () => {
    const email = "retry@example.com";
    const code = await requestCode(w, email, { handle: "@retry" });

    // First attempt fails the age gate (403) — the code must survive.
    const unattested = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { handle: "@retry", over18: false } },
    });
    expect(unattested.statusCode).to.equal(403);

    // Same code, box checked, succeeds — proving the 403 didn't consume it.
    const ok = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { handle: "@retry", over18: true } },
    });
    expect(ok.statusCode).to.equal(201);
  });

  it("rejects verify without profile when no server draft exists", async () => {
    const email = "nodraft@example.com";
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code: "000000" },
    });
    expect(res.statusCode).to.equal(400);
    expect(res.json().error.code).to.equal("validation");
  });

  it("rejects otp/request without a profile when no prior draft exists", async () => {
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: { email: "noprofile-req@example.com", purpose: "registration" },
    });
    expect(res.statusCode).to.equal(400);
    expect(res.json().error.code).to.equal("validation");
  });

  it("rejects handles shorter than 3 characters or without a letter", async () => {
    const short = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: {
        email: "short@example.com",
        purpose: "registration",
        profile: { handle: "@ab", over18: true },
      },
    });
    expect(short.statusCode).to.equal(400);
    expect(short.json().error.code).to.equal("validation");

    const digits = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: {
        email: "digits@example.com",
        purpose: "registration",
        profile: { handle: "@12345", over18: true },
      },
    });
    expect(digits.statusCode).to.equal(400);
    expect(digits.json().error.code).to.equal("validation");
  });

  it("409s official seat handles and persona names at otp/request", async () => {
    await ingestOfficialSeats(
      w.services.geoStore,
      { jurisdictionId: "ab-ca-gov", effectiveDate: "2019-04-16", boundaryYear: 2019 },
      paths.repoRoot,
    );
    const official = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: {
        email: "seat.squatter@example.com",
        purpose: "registration",
        profile: { handle: "@ab-edm_strth", over18: true },
      },
    });
    expect(official.statusCode).to.equal(409);
    expect(official.json().error.code).to.equal("handle_taken");

    const holder = await makeAccount(w, { handle: "persona_holder" });
    await w.db.pool.query(
      `INSERT INTO thread_keys (id, user_id, thread_id, jurisdiction, pubkey, persona_name)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), holder.userId, randomUUID(), "oursay-global", "pk_reserved_persona", "BraveOtter99"],
    );
    const persona = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: {
        email: "persona.squatter@example.com",
        purpose: "registration",
        profile: { handle: "@BraveOtter99", over18: true },
      },
    });
    expect(persona.statusCode).to.equal(409);
    expect(persona.json().error.code).to.equal("handle_taken");
  });
});
