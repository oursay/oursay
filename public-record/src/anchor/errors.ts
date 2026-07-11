/**
 * Thrown when a target tip's block hash does not match the platform header at the same height.
 * Recovery is deliberate (fork / wipe / redeploy) — never silent rewrite.
 */
export class AnchorIntegrityError extends Error {
  readonly chainId: string;
  readonly height: number;
  readonly expectedRoot: string;
  readonly actualRoot: string;
  readonly targetKind: string;

  constructor(opts: {
    chainId: string;
    height: number;
    expectedRoot: string;
    actualRoot: string;
    targetKind: string;
  }) {
    super(
      `anchor integrity mismatch on ${opts.targetKind} chain ${opts.chainId} at height ${opts.height}: ` +
        `platform root ${opts.expectedRoot} !== target root ${opts.actualRoot}`,
    );
    this.name = "AnchorIntegrityError";
    this.chainId = opts.chainId;
    this.height = opts.height;
    this.expectedRoot = opts.expectedRoot;
    this.actualRoot = opts.actualRoot;
    this.targetKind = opts.targetKind;
  }
}
