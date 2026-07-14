// Persona mint must widen digits when the 2-digit candidate equals an existing users.handle.

import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { p256 } from "@noble/curves/p256";
import { bytesToHex } from "@noble/hashes/utils";
import { newSalt } from "../src/crypto/commitment.js";
import { buildThreadBindingInputs } from "../src/identity/binding.js";
import { deriveThreadKey } from "../src/identity/derive.js";
import { personaNameForPubkey } from "../src/identity/persona-name.js";
import { signBinding } from "../src/identity/platform-binding.js";
import { getWorld, type World } from "./helpers/world.js";
import { jurisdictionMaster } from "./fixtures/identity-vectors.js";

describe("20 persona mint: clash with users.handle widens digits", () => {
  let w: World;
  const platformPriv = bytesToHex(p256.utils.randomPrivateKey());
  const jurisdiction = "oursay-global";

  before(async () => {
    w = await getWorld();
  });
  beforeEach(async () => {
    await w.store.reset();
  });

  it("skips a 2-digit candidate that matches a registered user handle", async () => {
    const threadId = randomUUID();
    const joinerId = randomUUID();
    const squatterId = randomUUID();

    const jm = jurisdictionMaster();
    const { threadPubkey } = deriveThreadKey({
      jurisdictionMaster: jm,
      threadId,
      jurisdiction,
    });
    const twoDigit = personaNameForPubkey(threadPubkey, 2);
    const threeDigit = personaNameForPubkey(threadPubkey, 3);
    expect(twoDigit).to.not.equal(threeDigit);

    // Squatter owns the 2-digit display string as a user handle.
    await w.store.putUser({ id: squatterId, handle: twoDigit });
    await w.store.putUser({ id: joinerId });
    await w.store.putJurisdictionMaster({
      userId: joinerId,
      jurisdiction,
      masterPubkey: bytesToHex(p256.getPublicKey(jm)),
    });

    const saltT = newSalt();
    const { binding } = buildThreadBindingInputs({
      userId: joinerId,
      threadPubkey,
      threadId,
      jurisdiction,
      kycTier: "identity_verified",
      saltT,
    });
    await w.store.registerThreadBinding({
      threadPubkey,
      userId: joinerId,
      threadId,
      jurisdiction,
      kycTier: "identity_verified",
      commitment: binding.commitment,
      bindingSig: signBinding(binding, platformPriv),
    });

    const minted = await w.store.getPersonaName(threadPubkey);
    expect(minted, "nameMinted").to.be.a("string");
    expect(minted).to.not.equal(twoDigit);
    // Widened past the colliding 2-digit candidate (typically lands on 3).
    const suffix = minted!.match(/(\d+)$/)?.[1] ?? "";
    expect(suffix.length).to.be.at.least(3);
    expect(await w.store.getPersonaByName(twoDigit)).to.equal(null);
    expect(await w.store.getPersonaByName(minted!)).to.deep.include({ pubkey: threadPubkey });
    // Sanity: the 3-digit generator matches when that's what we minted.
    if (suffix.length === 3) expect(minted).to.equal(threeDigit);
  });
});
