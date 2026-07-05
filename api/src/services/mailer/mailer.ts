// MailerService: role-based sending over pluggable adapters with primary→failover routing.
//
// A role ("registration" | "recovery" | "login") maps to an ordered list of vendor adapters; send()
// tries them in order and succeeds on the first that delivers. This is the seam for future primary/
// failover/hybrid routing. Adapters never log OTP codes or PII — only non-sensitive metadata.

import type { MailerConfig, MailerVendor } from "../../config.js";

export type MailRole = "registration" | "recovery" | "login";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailAdapter {
  readonly vendor: MailerVendor;
  send(msg: MailMessage): Promise<void>;
}

export class MailerService {
  constructor(
    private readonly from: string,
    private readonly roles: Record<MailRole, MailerVendor[]>,
    private readonly adapters: Map<MailerVendor, MailAdapter>,
  ) {}

  get fromAddress(): string {
    return this.from;
  }

  /** Send for a role, trying the role's adapters in order. Throws only if every adapter fails. */
  async send(role: MailRole, msg: MailMessage): Promise<{ vendor: MailerVendor }> {
    const order = this.roles[role];
    if (!order || order.length === 0) {
      throw new Error(`No mailer adapters configured for role "${role}"`);
    }
    const errors: string[] = [];
    for (const vendor of order) {
      const adapter = this.adapters.get(vendor);
      if (!adapter) {
        errors.push(`${vendor}: not initialized`);
        continue;
      }
      try {
        await adapter.send(msg);
        return { vendor };
      } catch (e) {
        errors.push(`${vendor}: ${(e as Error).message}`);
      }
    }
    throw new Error(`All mailer adapters failed for role "${role}" — ${errors.join("; ")}`);
  }
}

/**
 * Build a MailerService from config. Only adapters referenced by a role (plus any test overrides)
 * are instantiated. Pass `overrides` to inject a fixture adapter (e.g. NoopMailAdapter) in tests.
 */
export async function createMailerService(
  cfg: MailerConfig,
  overrides: Partial<Record<MailerVendor, MailAdapter>> = {},
): Promise<MailerService> {
  const needed = new Set<MailerVendor>([...cfg.roles.registration, ...cfg.roles.recovery, ...cfg.roles.login]);
  const adapters = new Map<MailerVendor, MailAdapter>();

  for (const vendor of needed) {
    if (overrides[vendor]) {
      adapters.set(vendor, overrides[vendor]!);
      continue;
    }
    adapters.set(vendor, await buildAdapter(vendor, cfg));
  }
  // Make any explicit overrides available even if not referenced by a role.
  for (const [vendor, adapter] of Object.entries(overrides)) {
    if (adapter) adapters.set(vendor as MailerVendor, adapter);
  }

  return new MailerService(cfg.from, cfg.roles, adapters);
}

async function buildAdapter(vendor: MailerVendor, cfg: MailerConfig): Promise<MailAdapter> {
  switch (vendor) {
    case "noop": {
      const { NoopMailAdapter } = await import("./adapters/noop.js");
      return new NoopMailAdapter();
    }
    case "postmark": {
      const { PostmarkMailAdapter } = await import("./adapters/postmark.js");
      return new PostmarkMailAdapter(cfg.from, cfg.postmark.token);
    }
    case "smtp": {
      const { SmtpMailAdapter } = await import("./adapters/smtp.js");
      return new SmtpMailAdapter(cfg.from, cfg.smtp);
    }
    case "ses": {
      const { SesMailAdapter } = await import("./adapters/ses.js");
      return new SesMailAdapter(cfg.from, cfg.ses.region);
    }
  }
}
