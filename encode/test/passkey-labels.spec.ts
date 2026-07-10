import { expect } from "chai";
import { encodeUuidV4Base59 } from "../src/uuid-base59.js";
import {
  formatThreadPasskeyDisplayName,
  formatThreadPasskeyUserName,
} from "../src/passkey-labels.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const THREAD_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("passkey-labels", () => {
  it("formats thread passkey user.name with Base59 UUIDs", () => {
    const name = formatThreadPasskeyUserName(USER_ID, THREAD_ID);
    expect(name).to.equal(
      `${encodeUuidV4Base59(USER_ID)}:${encodeUuidV4Base59(THREAD_ID)}`,
    );
    expect(name).not.to.include("-");
  });

  it("formats thread passkey displayName with Base59 thread id", () => {
    expect(formatThreadPasskeyDisplayName(THREAD_ID)).to.equal(
      `OurSay thread ${encodeUuidV4Base59(THREAD_ID)}`,
    );
  });

  it("passes mock ids through unchanged", () => {
    expect(formatThreadPasskeyUserName("user-1", "pet-sam-109st")).to.equal(
      "user-1:pet-sam-109st",
    );
    expect(formatThreadPasskeyDisplayName("pet-sam-109st")).to.equal(
      "OurSay thread pet-sam-109st",
    );
  });
});
