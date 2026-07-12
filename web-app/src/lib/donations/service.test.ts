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

  it("openGitHubSponsors opens configured URL", async () => {
    process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL = "https://github.com/sponsors/oursay";
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

  it("openGitHubSponsors warns when URL unset", async () => {
    delete process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { openGitHubSponsors } = await import("./service");
    expect(openGitHubSponsors()).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
