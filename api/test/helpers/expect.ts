// Assert that an async call rejects with a ServiceError carrying a specific code.

import { expect } from "chai";
import { isServiceError, type ErrorCode } from "../../src/errors.js";

export async function expectServiceError(fn: () => Promise<unknown>, code: ErrorCode): Promise<void> {
  try {
    await fn();
  } catch (e) {
    expect(isServiceError(e), `expected ServiceError, got ${String(e)}`).to.equal(true);
    expect((e as { code: string }).code).to.equal(code);
    return;
  }
  expect.fail(`expected ServiceError "${code}" but the call resolved`);
}
