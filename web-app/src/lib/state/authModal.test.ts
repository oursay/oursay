import { describe, expect, it } from "vitest";
import {
  authChooser,
  authEmailOf,
  authLogin,
  authLoginByEmail,
  authLoginOtp,
  authNone,
  authOtp,
  authRecover,
  authRegister,
  toggleLoginOtp,
  type AuthModal,
} from "./authModal";

describe("auth modal constructors", () => {
  it("each constructor yields exactly one dialog kind (exclusivity by construction)", () => {
    const cases: Array<[AuthModal, AuthModal["kind"]]> = [
      [authNone, "none"],
      [authChooser, "chooser"],
      [authRegister, "register"],
      [authRecover(), "recover"],
      [authLogin(), "login"],
      [authOtp("registration"), "otp"],
    ];
    for (const [modal, kind] of cases) {
      expect(modal.kind).toBe(kind);
    }
  });

  it("login opens on the passkey path; the email variant opens on the OTP path", () => {
    expect(authLogin()).toEqual({ kind: "login", otp: false, email: undefined });
    expect(authLoginOtp("a@b.co")).toEqual({ kind: "login", otp: true, email: "a@b.co" });
  });

  it("tags the OTP dialog with its originating flow and email", () => {
    expect(authOtp("recovery", "a@b.co")).toEqual({
      kind: "otp",
      flow: "recovery",
      email: "a@b.co",
    });
    expect(authOtp("registration")).toEqual({
      kind: "otp",
      flow: "registration",
      email: undefined,
    });
  });
});

describe("authLoginByEmail", () => {
  it("jumps to the login-OTP dialog for a valid email", () => {
    expect(authLoginByEmail("a@b.co", true)).toEqual({ kind: "otp", flow: "login", email: "a@b.co" });
  });

  it("keeps the chooser on its OTP sub-path for an invalid email", () => {
    expect(authLoginByEmail("nope", false)).toEqual({ kind: "login", otp: true, email: "nope" });
  });
});

describe("toggleLoginOtp", () => {
  it("flips the login chooser's OTP sub-path in place", () => {
    expect(toggleLoginOtp(authLogin("a@b.co"))).toEqual({
      kind: "login",
      otp: true,
      email: "a@b.co",
    });
    expect(toggleLoginOtp(authLoginOtp("a@b.co"))).toEqual({
      kind: "login",
      otp: false,
      email: "a@b.co",
    });
  });

  it("is a no-op outside the login modal", () => {
    expect(toggleLoginOtp(authChooser)).toEqual(authChooser);
    expect(toggleLoginOtp(authOtp("login", "a@b.co"))).toEqual(authOtp("login", "a@b.co"));
  });
});

describe("authEmailOf", () => {
  it("reads the email from whichever dialog carries one", () => {
    expect(authEmailOf(authRecover("r@b.co"))).toBe("r@b.co");
    expect(authEmailOf(authLogin("l@b.co"))).toBe("l@b.co");
    expect(authEmailOf(authOtp("recovery", "o@b.co"))).toBe("o@b.co");
  });

  it("is undefined for dialogs without an email", () => {
    expect(authEmailOf(authNone)).toBeUndefined();
    expect(authEmailOf(authChooser)).toBeUndefined();
    expect(authEmailOf(authRegister)).toBeUndefined();
    expect(authEmailOf(authLogin())).toBeUndefined();
  });
});
