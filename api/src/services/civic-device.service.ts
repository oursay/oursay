// CivicDeviceService: authenticated enrollment / listing / revocation of CIVIC signing device keys
// (public.device_keys, docs/08 §5.4). A second phone = a second account-login passkey AND a second
// civic device key under the same user. The platform only ever holds the PUBLIC key; signing happens
// on-device (docs/08 §6). This is separate from account-login passkeys (auth.passkey_credentials).

import { ServiceError } from "../errors.js";
import type { CivicDeviceRepo, DeviceKeyRecord } from "../repo/civic-device.repo.js";

/** Compressed-or-uncompressed SEC1 P-256 point, lowercase hex (33 or 65 bytes → 66 or 130 chars). */
const PUBKEY_HEX = /^(02|03)[0-9a-f]{64}$|^04[0-9a-f]{128}$/;

export interface CivicDeviceView {
  devicePubkey: string;
  label: string | null;
  enrolledAt: string;
}

export interface CivicDeviceServiceDeps {
  civicDeviceRepo: CivicDeviceRepo;
}

export class CivicDeviceService {
  constructor(private readonly d: CivicDeviceServiceDeps) {}

  /** Enrol a public device key for the authenticated user. Rejects anything that isn't a SEC1 point
   *  (defence against a private key or junk being posted). Returns the public view. */
  async enroll(input: { userId: string; devicePubkey: string; label?: string | null }): Promise<CivicDeviceView> {
    const devicePubkey = input.devicePubkey?.trim().toLowerCase();
    if (!devicePubkey || !PUBKEY_HEX.test(devicePubkey)) {
      throw new ServiceError("validation", "devicePubkey must be a SEC1 P-256 public key in hex");
    }
    const existing = await this.d.civicDeviceRepo.getByPubkey(devicePubkey);
    if (existing && existing.userId !== input.userId) {
      // A device key is globally unique; it cannot be claimed across accounts.
      throw new ServiceError("conflict", "This device key is already enrolled to another account");
    }
    await this.d.civicDeviceRepo.enroll({ userId: input.userId, devicePubkey, label: input.label ?? null });
    const row = await this.d.civicDeviceRepo.getByPubkey(devicePubkey);
    return view(row!);
  }

  async list(userId: string): Promise<CivicDeviceView[]> {
    const rows = await this.d.civicDeviceRepo.listActiveByUser(userId);
    return rows.map(view);
  }

  /** Revoke one of the caller's OWN civic devices. 404 when it isn't theirs (no cross-account info). */
  async revoke(input: { userId: string; devicePubkey: string }): Promise<void> {
    const devicePubkey = input.devicePubkey?.trim().toLowerCase();
    const row = devicePubkey ? await this.d.civicDeviceRepo.getByPubkey(devicePubkey) : null;
    if (!row || row.userId !== input.userId) {
      throw new ServiceError("not_found", "Civic device not found");
    }
    await this.d.civicDeviceRepo.revoke(devicePubkey);
  }
}

function view(r: DeviceKeyRecord): CivicDeviceView {
  return { devicePubkey: r.devicePubkey, label: r.label, enrolledAt: r.enrolledAt };
}
