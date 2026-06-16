import { loadExistingUserWallet, newUserRef, provisionUserWallet, signPlatformBindingAndIdentify } from "./flows.js";

function logSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

async function main(): Promise<void> {
  const userRef = newUserRef();
  const threadId = "thread-demo-001";
  const resumeSubOrgId = process.env.TURNKEY_RESUME_SUB_ORG_ID?.trim();

  logSection(resumeSubOrgId ? "1. Resume existing sub-org wallet" : "1. Provision user + master HD wallet (sub-org)");
  const wallet = resumeSubOrgId
    ? await loadExistingUserWallet(resumeSubOrgId)
    : await provisionUserWallet(userRef);

  console.log("subOrganizationId:", wallet.subOrganizationId);
  console.log("walletId:", wallet.walletId);
  console.log("masterAddress:", wallet.masterAddress);
  console.log("threadPath:", wallet.threadPath);
  console.log("threadAddress:", wallet.threadAddress);

  logSection("2. Sign platform binding + infer user from response");
  const signed = await signPlatformBindingAndIdentify({
    subOrganizationId: wallet.subOrganizationId,
    signWithAddress: wallet.masterAddress,
    userRef: resumeSubOrgId ? `resume-${wallet.subOrganizationId.slice(0, 8)}` : userRef,
    threadId,
    walletId: wallet.walletId,
    threadPath: wallet.threadPath,
    masterAddress: wallet.masterAddress,
    threadAddress: wallet.threadAddress,
  });

  console.log("activityId:", signed.activityId);
  console.log("fingerprint:", signed.fingerprint);
  console.log("signWith:", signed.signWith);
  console.log("bindingDigest:", signed.bindingDigest);
  console.log("signature.r:", signed.signature.r.slice(0, 18) + "…");
  console.log("inferredUser:", signed.inferredUser);

  logSection("Done");
  console.log("Turnkey HD wallet + thread key + signed binding flow succeeded.");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("\nTurnkey test failed:");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
