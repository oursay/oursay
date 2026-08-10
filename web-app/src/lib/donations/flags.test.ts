import { afterEach, describe, expect, it, vi } from "vitest";

describe("donation flags", () => {
  const prev = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in prev)) delete process.env[key];
    }
    Object.assign(process.env, prev);
    vi.resetModules();
  });

  it("defaults demo banner on, donation surfaces off, and no provider", async () => {
    delete process.env.NEXT_PUBLIC_SHOW_DEMO_BANNER;
    delete process.env.NEXT_PUBLIC_SHOW_DONATION_BANNER;
    delete process.env.NEXT_PUBLIC_SHOW_DONATION_MODAL_PUBLIC;
    delete process.env.NEXT_PUBLIC_SHOW_DONATION_MODAL_KYC;
    delete process.env.NEXT_PUBLIC_DONATION_MODAL_PROVIDER;
    delete process.env.NEXT_PUBLIC_ETRANSFER_EMAIL;
    delete process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL;
    const mod = await import("./flags");
    expect(mod.SHOW_DEMO_BANNER).toBe(true);
    expect(mod.SHOW_DONATION_BANNER).toBe(false);
    expect(mod.SHOW_DONATION_MODAL_PUBLIC).toBe(false);
    expect(mod.SHOW_DONATION_MODAL_KYC).toBe(false);
    expect(mod.DONATION_MODAL_PROVIDER).toBeNull();
    expect(mod.donationProviderConfigured()).toBe(false);
    expect(mod.resolveFabBanner()).toBe("demo");
  });

  it("parses etransfer provider and email", async () => {
    process.env.NEXT_PUBLIC_DONATION_MODAL_PROVIDER = "etransfer";
    process.env.NEXT_PUBLIC_ETRANSFER_EMAIL = " donate@oursay.ca ";
    const mod = await import("./flags");
    expect(mod.DONATION_MODAL_PROVIDER).toBe("etransfer");
    expect(mod.ETRANSFER_EMAIL).toBe("donate@oursay.ca");
    expect(mod.donationProviderConfigured()).toBe(true);
  });

  it("donationProviderConfigured requires sponsors URL for github", async () => {
    process.env.NEXT_PUBLIC_DONATION_MODAL_PROVIDER = "github";
    delete process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL;
    const mod = await import("./flags");
    expect(mod.donationProviderConfigured()).toBe(false);
  });

  it("donationProviderConfigured is false when provider unset even if sponsors URL set", async () => {
    delete process.env.NEXT_PUBLIC_DONATION_MODAL_PROVIDER;
    process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL =
      "https://github.com/sponsors/oursay";
    const mod = await import("./flags");
    expect(mod.DONATION_MODAL_PROVIDER).toBeNull();
    expect(mod.donationProviderConfigured()).toBe(false);
  });

  it("parses github provider aliases", async () => {
    process.env.NEXT_PUBLIC_DONATION_MODAL_PROVIDER = "sponsors";
    process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL =
      "https://github.com/sponsors/oursay";
    const mod = await import("./flags");
    expect(mod.DONATION_MODAL_PROVIDER).toBe("github");
    expect(mod.donationProviderConfigured()).toBe(true);
  });

  it("shows donation banner when demo is off and donation on", async () => {
    process.env.NEXT_PUBLIC_SHOW_DEMO_BANNER = "false";
    process.env.NEXT_PUBLIC_SHOW_DONATION_BANNER = "true";
    const mod = await import("./flags");
    mod.resetBannerConflictWarnForTests();
    expect(mod.resolveFabBanner()).toBe("donation");
  });

  it("demo supersedes donation and warns once", async () => {
    process.env.NEXT_PUBLIC_SHOW_DEMO_BANNER = "true";
    process.env.NEXT_PUBLIC_SHOW_DONATION_BANNER = "true";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mod = await import("./flags");
    mod.resetBannerConflictWarnForTests();
    expect(mod.resolveFabBanner()).toBe("demo");
    expect(mod.resolveFabBanner()).toBe("demo");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/Demo banner supersedes/);
    warn.mockRestore();
  });

  it("donationsUnavailableMessage is generic when no provider", async () => {
    delete process.env.NEXT_PUBLIC_DONATION_MODAL_PROVIDER;
    delete process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL;
    delete process.env.NEXT_PUBLIC_ETRANSFER_EMAIL;
    const mod = await import("./flags");
    expect(mod.donationUnavailableReason()).toBeNull();
    expect(mod.donationsUnavailableMessage()).toBe(
      "OurSay is currently unable to accept donations.",
    );
  });

  it("donationsUnavailableMessage includes reason when github URL missing", async () => {
    process.env.NEXT_PUBLIC_DONATION_MODAL_PROVIDER = "github";
    delete process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL;
    const mod = await import("./flags");
    expect(mod.donationsUnavailableMessage()).toBe(
      "OurSay is currently unable to accept donations because the sponsorship link isn’t available yet.",
    );
  });

  it("donationsUnavailableMessage includes reason when etransfer email missing", async () => {
    process.env.NEXT_PUBLIC_DONATION_MODAL_PROVIDER = "etransfer";
    delete process.env.NEXT_PUBLIC_ETRANSFER_EMAIL;
    const mod = await import("./flags");
    expect(mod.donationsUnavailableMessage()).toBe(
      "OurSay is currently unable to accept donations because the e-Transfer email isn’t available yet.",
    );
  });

  it("donationsUnavailableMessage accepts an explicit reason", async () => {
    const mod = await import("./flags");
    expect(mod.donationsUnavailableMessage("checkout is offline")).toBe(
      "OurSay is currently unable to accept donations because checkout is offline.",
    );
    expect(mod.donationsUnavailableMessage(null)).toBe(
      "OurSay is currently unable to accept donations.",
    );
  });
});
