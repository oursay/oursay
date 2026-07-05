// W4 easy lane (Task #10): authenticated /v1/me/* surface + PATCH /v1/profile.

import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { PublicChain, RecordService } from "@oursay/public-record";
import { fullSessionAccount, limitedSessionAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("23 me surface: jurisdictions, prefs, visibility, districts, shares, profile patch", () => {
  let w: World;

  beforeEach(async () => {
    w = await resetWorld();
  });

  it("GET /v1/me/jurisdictions returns memberships", async () => {
    const { userId, token } = await fullSessionAccount(w, "me@example.com");
    await w.services.repos.membership.add(userId, "oursay-global");
    await w.services.repos.membership.add(userId, "ab-ca-gov");
    const res = await w.app.inject({ method: "GET", url: "/v1/me/jurisdictions", headers: bearer(token) });
    expect(res.statusCode).to.equal(200, res.body);
    expect(res.json().jurisdictionIds).to.include.members(["oursay-global", "ab-ca-gov"]);
  });

  it("PUT /v1/me/jurisdictions diffs subscriptions and always retains oursay-global", async () => {
    const { userId, token } = await fullSessionAccount(w, "subs@example.com");
    await w.services.repos.membership.add(userId, "oursay-global");
    await w.services.repos.membership.add(userId, "ab-ca-gov");

    const res = await w.app.inject({
      method: "PUT",
      url: "/v1/me/jurisdictions",
      headers: bearer(token),
      payload: { jurisdictionIds: [] },
    });
    expect(res.statusCode).to.equal(200, res.body);
    expect(res.json().jurisdictionIds).to.deep.equal(["oursay-global"]);

    await w.services.repos.membership.setRole(userId, "ab-ca-gov", "official", "edmonton-city-centre");
    const addBack = await w.app.inject({
      method: "PUT",
      url: "/v1/me/jurisdictions",
      headers: bearer(token),
      payload: { jurisdictionIds: ["ab-ca-gov"] },
    });
    expect(addBack.statusCode).to.equal(200);
    const role = await w.services.repos.membership.get(userId, "ab-ca-gov");
    expect(role?.role).to.equal("official");
  });

  it("PUT /v1/me/jurisdictions 404s unknown jurisdiction ids", async () => {
    const { token } = await fullSessionAccount(w, "badjur@example.com");
    const res = await w.app.inject({
      method: "PUT",
      url: "/v1/me/jurisdictions",
      headers: bearer(token),
      payload: { jurisdictionIds: ["no-such-jurisdiction"] },
    });
    expect(res.statusCode).to.equal(404);
  });

  it("GET/PATCH /v1/me/signing-prefs round-trips and null deletes a key", async () => {
    const { userId, token } = await fullSessionAccount(w, "prefs@example.com");
    expect((await w.app.inject({ method: "GET", url: "/v1/me/signing-prefs", headers: bearer(token) })).json()).to.deep.equal({});

    const patch = await w.app.inject({
      method: "PATCH",
      url: "/v1/me/signing-prefs",
      headers: bearer(token),
      payload: { vote: "passkey", post: "quick" },
    });
    expect(patch.statusCode).to.equal(200);
    expect(patch.json()).to.deep.equal({ vote: "passkey", post: "quick" });

    const del = await w.app.inject({
      method: "PATCH",
      url: "/v1/me/signing-prefs",
      headers: bearer(token),
      payload: { post: null },
    });
    expect(del.json()).to.deep.equal({ vote: "passkey" });
    expect(await w.services.repos.signingPrefs.get(userId)).to.deep.equal({ vote: "passkey" });
  });

  it("GET/PATCH /v1/me/visibility updates account default", async () => {
    const { token } = await fullSessionAccount(w, "vis@example.com");
    expect((await w.app.inject({ method: "GET", url: "/v1/me/visibility", headers: bearer(token) })).json().visibility).to.equal(
      "anonymous",
    );

    const patch = await w.app.inject({
      method: "PATCH",
      url: "/v1/me/visibility",
      headers: bearer(token),
      payload: { visibility: "my_district" },
    });
    expect(patch.statusCode).to.equal(200);
    expect(patch.json().visibility).to.equal("my_district");
  });

  it("PUT /v1/me/threads/:id/visibility sets and clears per-thread override", async () => {
    const { userId, token } = await fullSessionAccount(w, "threadvis@example.com");
    const svc = new RecordService(new PublicChain(w.services.recordStore, randomUUID()), w.services.recordStore);
    const post = await svc.create({ type: "post", author: "pk-tv", content: { title: "T", body: "b" } });
    await w.services.recordStore.registerThreadBinding({
      threadPubkey: "pk-tv",
      userId,
      threadId: post.entityId,
      jurisdiction: "oursay-global",
      commitment: "c-pk-tv",
      bindingSig: "sig-pk-tv",
    });

    const set = await w.app.inject({
      method: "PUT",
      url: `/v1/me/threads/${post.entityId}/visibility`,
      headers: bearer(token),
      payload: { visibility: "public" },
    });
    expect(set.statusCode).to.equal(200);
    expect(set.json().visibility).to.equal("public");

    const clear = await w.app.inject({
      method: "PUT",
      url: `/v1/me/threads/${post.entityId}/visibility`,
      headers: bearer(token),
      payload: { visibility: null },
    });
    expect(clear.statusCode).to.equal(200);
    expect(clear.json().visibility).to.equal(null);
  });

  it("PUT /v1/me/threads/:id/visibility 404s when the user has no key in the thread", async () => {
    const { token } = await fullSessionAccount(w, "nothread@example.com");
    const res = await w.app.inject({
      method: "PUT",
      url: `/v1/me/threads/${randomUUID()}/visibility`,
      headers: bearer(token),
      payload: { visibility: "public" },
    });
    expect(res.statusCode).to.equal(404);
  });

  it("GET /v1/me/districts returns self-only home district slugs", async () => {
    const { userId, token } = await fullSessionAccount(w, "districts@example.com", { province: "AB" });
    await w.services.recordStore.putAttestation({ userId, provider: "stub", tier: "residency_verified" });
    const res = await w.app.inject({ method: "GET", url: "/v1/me/districts", headers: bearer(token) });
    expect(res.statusCode).to.equal(200);
    expect(res.json().districts).to.be.an("array");
  });

  it("POST /v1/me/shares/:shareKey deduplicates marks but always returns count", async () => {
    const { userId, token } = await fullSessionAccount(w, "share@example.com");
    const key = "share-test-key";
    const first = await w.app.inject({ method: "POST", url: `/v1/me/shares/${key}`, headers: bearer(token) });
    expect(first.statusCode).to.equal(200);
    expect(first.json()).to.deep.equal({ counted: true, count: 1 });

    const second = await w.app.inject({ method: "POST", url: `/v1/me/shares/${key}`, headers: bearer(token) });
    expect(second.json()).to.deep.equal({ counted: false, count: 1 });

    const { token: token2 } = await fullSessionAccount(w, "share2@example.com");
    const third = await w.app.inject({ method: "POST", url: `/v1/me/shares/${key}`, headers: bearer(token2) });
    expect(third.json()).to.deep.equal({ counted: true, count: 2 });
    expect(userId).to.be.a("string");
  });

  it("PATCH /v1/profile updates fields and triggers best-effort geocode on address change", async () => {
    const { userId, token } = await fullSessionAccount(w, "patch@example.com");
    const res = await w.app.inject({
      method: "PATCH",
      url: "/v1/profile",
      headers: bearer(token),
      payload: { firstName: "Pat", postalCode: "T2P 1H9", province: "AB", country: "CA" },
    });
    expect(res.statusCode).to.equal(200, res.body);
    expect(res.json().firstName).to.equal("Pat");
    expect(res.json().address.postalCode).to.equal("T2P 1H9");
    expect(await w.services.repos.geocode.getCurrent(userId)).to.not.equal(null);
  });

  it("rejects limited sessions with 403 on /v1/me routes", async () => {
    const { token } = await limitedSessionAccount(w, "lim@example.com", "login");
    const res = await w.app.inject({ method: "GET", url: "/v1/me/jurisdictions", headers: bearer(token) });
    expect(res.statusCode).to.equal(403);
  });
});
