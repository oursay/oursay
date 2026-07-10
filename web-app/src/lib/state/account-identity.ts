import { isMockOnly } from "@/lib/api/client";
import { wireHandle } from "@/lib/handle";
import { MY_HANDLE, MY_NAME } from "@/lib/mock/constants";
import type { AppState } from "./types";

export interface AccountIdentity {
  name: string;
  handle: string;
}

/** Display name + wire handle for the signed-in account UI. */
export function accountIdentity(state: AppState): AccountIdentity | null {
  if (!state.loggedIn) return null;
  if (isMockOnly()) {
    return { name: MY_NAME, handle: MY_HANDLE };
  }
  const handle = wireHandle(state.accountHandle);
  if (!handle) return null;
  const name = state.accountDisplayName?.trim() || handle;
  return { name, handle };
}
