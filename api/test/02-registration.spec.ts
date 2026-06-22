import { expect } from "chai";
import { codeFromLastMail, resetWorld, type World } from "./helpers/world.js";

const ADULT_DOB = "1990-06-15";
const MINOR_DOB = `${new Date().getUTCFullYear() - 10}-01-01`;

async function requestCode(w: World, email: string): Promise<string> {
  const res = await w.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { email, purpose: "registration" } });
  expect(res.statusCode).to.equal(202);
  const body = res.json() as { status: string; expiresAt?: string };
  expect(body.expiresAt).to.be.a("string");
  expect(new Date(body.expiresAt!).getTime()).to.be.greaterThan(Date.now());
  return codeFromLastMail(w.mail, email);
}

describe("02 registration: OTP verify + profile → account + session", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("registers an adult and returns a session", async () => {
    const email = "newuser@example.com";
    const code = await requestCode(w, email);
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: {
        email,
        code,
        profile: {
          handle: "@newuser",
          firstName: "New",
          lastName: "User",
          birthdate: ADULT_DOB,
          address: { province: "AB", postalCode: "t2p1h9", country: "ca" },
        },
      },
    });
    expect(res.statusCode).to.equal(201);
    const body = res.json();
    expect(body.userId).to.be.a("string");
    expect(body.session.token).to.be.a("string");
    expect(body.session.scope).to.equal("full");

    // The session authenticates /v1/auth/session.
    const me = await w.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${body.session.token}` },
    });
    expect(me.statusCode).to.equal(200);
    expect(me.json().userId).to.equal(body.userId);

    // Private PII (first/last name) + normalized address landed on the profile.
    const profile = await w.services.repos.profile.getByUserId(body.userId);
    expect(profile?.postalCode).to.equal("T2P 1H9");
    expect(profile?.province).to.equal("AB");
    expect(profile?.firstName).to.equal("New");
    expect(profile?.lastName).to.equal("User");
    // Handle stored as the unique @username; displayName defaults to the handle without its '@'.
    const user = await w.services.repos.user.getById(body.userId);
    expect(user?.handle).to.equal("@newuser");
    expect(user?.displayName).to.equal("newuser");
  });

  it("registers without a handle (display name stays null until a public profile is claimed)", async () => {
    const email = "anon@example.com";
    const code = await requestCode(w, email);
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { firstName: "Ann", lastName: "Onymous", birthdate: ADULT_DOB } },
    });
    expect(res.statusCode).to.equal(201);
    const user = await w.services.repos.user.getById(res.json().userId);
    expect(user?.handle).to.equal(null);
    expect(user?.displayName).to.equal(null);
  });

  it("rejects a malformed handle", async () => {
    // Handle format is validated BEFORE the OTP is consumed, so no real code is needed (a dummy
    // code also keeps the per-run OTP-request rate limit from being burned on a validation case).
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email: "badhandle@example.com", code: "000000", profile: { handle: "@bad name", birthdate: ADULT_DOB } },
    });
    expect(res.statusCode).to.equal(400);
    expect(res.json().error.code).to.equal("validation");
  });

  it("409s a handle that is already taken", async () => {
    const code1 = await requestCode(w, "first-handle@example.com");
    const first = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email: "first-handle@example.com", code: code1, profile: { handle: "@taken", birthdate: ADULT_DOB } },
    });
    expect(first.statusCode).to.equal(201);

    // Handle uniqueness is checked BEFORE the OTP is consumed, so the duplicate 409s on a dummy code.
    const second = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email: "second-handle@example.com", code: "000000", profile: { handle: "@taken", birthdate: ADULT_DOB } },
    });
    expect(second.statusCode).to.equal(409);
    expect(second.json().error.code).to.equal("handle_taken");
  });

  it("rejects an under-18 registrant", async () => {
    const email = "kid@example.com";
    const code = await requestCode(w, email);
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { displayName: "Too Young", birthdate: MINOR_DOB } },
    });
    expect(res.statusCode).to.equal(403);
    expect(res.json().error.code).to.equal("age_restricted");
  });

  it("409s an already-registered email at otp/request (no wasted code)", async () => {
    const email = "dupe@example.com";
    const code = await requestCode(w, email);
    const first = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { displayName: "First", birthdate: ADULT_DOB } },
    });
    expect(first.statusCode).to.equal(201);

    // A second registration code for the same email is refused up front — no code is emailed.
    w.mail.clear();
    const second = await w.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { email, purpose: "registration" } });
    expect(second.statusCode).to.equal(409);
    expect(second.json().error.code).to.equal("email_taken");
    expect(w.mail.outbox).to.have.length(0);
  });

  it("does not burn the OTP when registration fails the age gate", async () => {
    const email = "retry@example.com";
    const code = await requestCode(w, email);

    // First attempt fails the age gate (403) — the code must survive.
    const tooYoung = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { displayName: "Retry", birthdate: MINOR_DOB } },
    });
    expect(tooYoung.statusCode).to.equal(403);

    // Same code, corrected DOB, succeeds — proving the 403 didn't consume it.
    const ok = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { displayName: "Retry", birthdate: ADULT_DOB } },
    });
    expect(ok.statusCode).to.equal(201);
  });

  it("rejects a missing profile via schema validation", async () => {
    const email = "noprofile@example.com";
    const code = await requestCode(w, email);
    const res = await w.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { email, code } });
    expect(res.statusCode).to.equal(400);
  });
});
