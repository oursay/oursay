import { afterEach, describe, expect, it, vi } from "vitest";

describe("donation service", () => {
  const prev = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in prev)) delete process.env[key];
    }
    Object.assign(process.env, prev);
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("sponsorsUrlForSelection builds one-time checkout query", async () => {
    process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL =
      "https://github.com/sponsors/oursay";
    const { sponsorsUrlForSelection } = await import("./service");
    expect(sponsorsUrlForSelection({ amount: 5, recurring: false })).toBe(
      "https://github.com/sponsors/oursay/sponsorships?frequency=one-time&amount=5",
    );
  });

  it("sponsorsUrlForSelection maps recurring to monthly", async () => {
    process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL =
      "https://github.com/sponsors/oursay/";
    const { sponsorsUrlForSelection } = await import("./service");
    expect(sponsorsUrlForSelection({ amount: 20, recurring: true })).toBe(
      "https://github.com/sponsors/oursay/sponsorships?frequency=monthly&amount=20",
    );
  });

  it("sponsorsUrlForSelection opens profile for custom (no checkout 404)", async () => {
    process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL =
      "https://github.com/sponsors/oursay";
    const { sponsorsUrlForSelection } = await import("./service");
    expect(sponsorsUrlForSelection({ amount: "custom", recurring: true })).toBe(
      "https://github.com/sponsors/oursay",
    );
    expect(sponsorsUrlForSelection({ amount: "custom", recurring: false })).toBe(
      "https://github.com/sponsors/oursay",
    );
  });

  it("sponsorsUrlForSelection strips /sponsorships for custom env URLs", async () => {
    process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL =
      "https://github.com/sponsors/oursay/sponsorships";
    const { sponsorsUrlForSelection } = await import("./service");
    expect(sponsorsUrlForSelection({ amount: "custom", recurring: false })).toBe(
      "https://github.com/sponsors/oursay",
    );
  });

  it("openGitHubSponsors opens configured URL", async () => {
    process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL =
      "https://github.com/sponsors/oursay";
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    const { openGitHubSponsors } = await import("./service");
    expect(openGitHubSponsors()).toBe(true);
    expect(open).toHaveBeenCalledWith(
      "https://github.com/sponsors/oursay",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("openGitHubSponsors opens selection", async () => {
    process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL =
      "https://github.com/sponsors/oursay";
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    const { openGitHubSponsors } = await import("./service");
    expect(openGitHubSponsors({ amount: 50, recurring: false })).toBe(true);
    expect(open).toHaveBeenCalledWith(
      "https://github.com/sponsors/oursay/sponsorships?frequency=one-time&amount=50",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("openGitHubSponsors warns when URL unset", async () => {
    delete process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { openGitHubSponsors } = await import("./service");
    expect(openGitHubSponsors()).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
