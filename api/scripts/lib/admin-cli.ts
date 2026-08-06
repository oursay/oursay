/** Shared guards / argv helpers for platform admin CLIs. */

export function assertAdminCliAllowed(cliName: string): void {
  if (process.env.NODE_ENV === "development") return;
  if (process.env.NODE_ENV === "production" && process.env.OURSAY_ALLOW_PROD_ADMIN === "1") return;
  const env = process.env.NODE_ENV ?? "(unset)";
  throw new Error(
    `Refusing ${cliName}: NODE_ENV must be "development", or "production" with OURSAY_ALLOW_PROD_ADMIN=1 (got NODE_ENV=${env}).`,
  );
}

export function parseFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  return argv[i + 1]?.trim() || undefined;
}

export function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

export function positionals(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") continue;
    if (a.startsWith("-")) {
      // skip flag value when present
      if (!a.includes("=") && argv[i + 1] && !argv[i + 1]!.startsWith("-")) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}
