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

  it("defaults demo banner on and donation surfaces off", async () => {
    delete process.env.NEXT_PUBLIC_SHOW_DEMO_BANNER;
    delete process.env.NEXT_PUBLIC_SHOW_DONATION_BANNER;
    delete process.env.NEXT_PUBLIC_SHOW_DONATION_MODAL_PUBLIC;
    delete process.env.NEXT_PUBLIC_SHOW_DONATION_MODAL_KYC;
    const mod = await import("./flags");
    expect(mod.SHOW_DEMO_BANNER).toBe(true);
    expect(mod.SHOW_DONATION_BANNER).toBe(false);
    expect(mod.SHOW_DONATION_MODAL_PUBLIC).toBe(false);
    expect(mod.SHOW_DONATION_MODAL_KYC).toBe(false);
    expect(mod.resolveFabBanner()).toBe("demo");
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
});
