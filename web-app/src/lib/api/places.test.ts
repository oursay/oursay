import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALBERTA_ID, GLOBAL_ID } from "@/lib/types";

vi.mock("./client", () => ({
  isMockOnly: () => false,
  apiGet: vi.fn(),
}));

import { apiGet } from "./client";
import { listJurisdictionContentLimits } from "./places";

describe("listJurisdictionContentLimits (live)", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads content limits from GET /v1/public/jurisdictions", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [
        {
          id: GLOBAL_ID,
          level: "global",
          contentLimits: {
            post: { title: 200, body: 2000 },
            comment: { body: 2000 },
            petition: { title: 200, text: 5000 },
            poll: {
              question: 200,
              option: 100,
              maxOptions: 10,
              description: 2000,
            },
          },
        },
        {
          id: ALBERTA_ID,
          level: "provincial",
          label: "Alberta",
          contentLimits: {
            post: { title: 200, body: 2000 },
            comment: { body: 2000 },
            petition: { title: 200, text: 5000 },
            poll: {
              question: 400,
              option: 200,
              maxOptions: 10,
              description: 2000,
            },
          },
        },
      ],
    });

    const limits = await listJurisdictionContentLimits();

    expect(apiGet).toHaveBeenCalledWith("/v1/public/jurisdictions");
    expect(limits[GLOBAL_ID]?.post?.body).toBe(2000);
    expect(limits[ALBERTA_ID]?.petition?.text).toBe(5000);
    expect(limits[ALBERTA_ID]?.poll?.question).toBe(400);
    expect(limits[ALBERTA_ID]?.poll?.option).toBe(200);
    expect(limits[ALBERTA_ID]?.poll?.maxOptions).toBe(10);
  });

  it("falls back to platform defaults when an item omits contentLimits", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [{ id: GLOBAL_ID, level: "global" }],
    });

    const limits = await listJurisdictionContentLimits();

    expect(apiGet).toHaveBeenCalledWith("/v1/public/jurisdictions");
    expect(limits[GLOBAL_ID]?.comment?.body).toBe(2000);
    expect(limits[GLOBAL_ID]?.poll?.maxOptions).toBe(10);
  });
});
