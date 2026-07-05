"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type {
  GeoFilterMode,
  RecordKind,
  SignedFilterLevel,
  VerificationTier,
  ViewerContext,
} from "@/lib/types";
import { nextGeoFilterMode } from "@/lib/types";
import { nextSignedFilterLevel } from "@/lib/types/sign-tier";
import {
  COMMENTS_STATEMENT,
  MY_DISTRICTS,
  MY_NAME,
  NOW,
  POST_PETITION,
  POST_POLL,
  POST_RESULT,
  POSTS,
} from "@/lib/mock";
import { rootTypesForJurisdiction } from "@/lib/compose-eligibility";
import {
  AddJurisdictionModal,
  AppHeader,
  AuthChooser,
  Avatar,
  Button,
  CommentThread,
  ComposeFlow,
  Fab,
  FeedCard,
  FilterDropdown,
  JurisdictionSelector,
  LoginChooser,
  OtpVerify,
  PetitionProgress,
  PollOptions,
  ProfileModal,
  ReactionButtons,
  RecordTypeSection,
  RegisterForm,
  ResultOutcome,
  ScopeTag,
  SignModal,
  VerificationPill,
  SignedPill,
  AuthorBadgeGroup,
} from "@/components";
import type { ComposeStep } from "@/components";

const VIEWER: ViewerContext = {
  loggedIn: true,
  kycTier: 2,
  viewerDistricts: MY_DISTRICTS,
};

const TIER_MIN = 0 as VerificationTier;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

const SWATCHES = [
  ["brand-600", "bg-brand-600"],
  ["brand-100", "bg-brand-100"],
  ["verify-600", "bg-verify-600"],
  ["verify-100", "bg-verify-100"],
  ["paper", "bg-paper border border-border"],
  ["surface", "bg-surface border border-border"],
];

export default function ComponentGallery() {
  // Chrome open states.
  const [filterOpen, setFilterOpen] = useState(true);
  const [jurOpen, setJurOpen] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginOtp, setLoginOtp] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [addJurOpen, setAddJurOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeStep, setComposeStep] = useState<ComposeStep>("where");
  const [composeJur, setComposeJur] = useState<string>();
  const [composeType, setComposeType] = useState<RecordKind>();

  // Filter demo state.
  const [includedKinds, setIncludedKinds] = useState<RecordKind[]>([
    "statement",
    "petition",
    "poll",
    "result",
  ]);
  const [verified, setVerified] = useState<VerificationTier>(0);
  const [myDistricts, setMyDistricts] = useState<GeoFilterMode>("off");
  const [affected, setAffected] = useState<GeoFilterMode>("off");
  const [signedFilter, setSignedFilter] = useState<SignedFilterLevel>(0);

  // Content interaction demo state.
  const [reaction, setReaction] = useState<"up" | "down" | null>("up");
  const [vote, setVote] = useState<string | null>(null);
  const [scopeExpanded, setScopeExpanded] = useState(false);

  const oneOfEach: RecordKind[] = ["statement", "petition", "poll", "result"];
  const feedSamples = oneOfEach
    .map((k) => POSTS.find((p) => p.kind === k))
    .filter((p): p is (typeof POSTS)[number] => Boolean(p));
  const multiDistrict = POSTS.find((p) => p.districts.length > 1);

  return (
    <main className="mx-auto min-h-screen max-w-md bg-paper">
      <div className="border-b border-border bg-surface px-4 py-3">
        <h1 className="text-lg font-bold text-ink">Component Gallery</h1>
        <p className="text-sm text-muted">
          Phase D2 — presentational components with mock props.
        </p>
      </div>

      <div className="space-y-8 p-4">
        <Section title="Design tokens">
          <div className="grid grid-cols-3 gap-2">
            {SWATCHES.map(([name, cls]) => (
              <div key={name} className="space-y-1">
                <div className={`h-12 rounded-lg ${cls}`} />
                <p className="text-[11px] text-muted">{name}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Layout — AppHeader + Fab">
          <div className="relative h-40 overflow-hidden rounded-xl border border-border bg-paper">
            <AppHeader
              jurisdictionLabel="Global"
              onJurisdictionLabelClick={() => {}}
              onJurisdictionCaretClick={() => {}}
              onFilterClick={() => {}}
              accountSlot={<Avatar name="Alex Morgan" size="sm" />}
            />
            <p className="p-4 text-sm text-muted">Scrollable body region…</p>
            <Fab onClick={() => {}} />
          </div>
        </Section>

        <Section title="Verification pills">
          <Row>
            <VerificationPill tier={1} />
            <VerificationPill tier={2} />
            <VerificationPill tier={2} authorGeo="home" />
            <VerificationPill tier={2} authorGeo="affected" />
            <VerificationPill tier={2} authorGeo="jurisdiction" />
            <VerificationPill tier={3} />
            <VerificationPill tier={2} mode="icon" />
            <VerificationPill tier={3} mode="icon" />
            <span className="text-xs text-muted">
              (residency glyph: map-pin · in-my-district · affected · in-jurisdiction; tier 0 renders nothing)
            </span>
          </Row>
        </Section>

        <Section title="Signed pill (signTier >= 1)">
          <Row>
            <SignedPill signTier={1} mode="full" />
            <SignedPill signTier={1} mode="icon" />
            <span className="text-xs text-muted">(signTier 0 renders nothing)</span>
          </Row>
        </Section>

        <Section title="Author badge group">
          <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">Post card row</span>
              <AuthorBadgeGroup
                signTier={1}
                tier={2}
                signedMode="icon"
                kycMode="full"
                align="right"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">Root comment</span>
              <AuthorBadgeGroup
                signTier={1}
                tier={2}
                signedMode="full"
                kycMode="icon"
                align="right"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">Nested comment</span>
              <AuthorBadgeGroup
                signTier={1}
                tier={3}
                signedMode="icon"
                kycMode="icon"
                align="right"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">Tier 0 KYC + passkey</span>
              <AuthorBadgeGroup
                signTier={1}
                tier={0}
                signedMode="full"
                kycMode="full"
                align="right"
              />
            </div>
          </div>
        </Section>

        <Section title="Scope tag (multi-district expansion)">
          {multiDistrict ? (
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="flex justify-end">
                <ScopeTag
                  jurisdiction={multiDistrict.jurisdiction}
                  districtSlugs={multiDistrict.districts}
                  expanded={scopeExpanded}
                  onExpandToggle={() => setScopeExpanded((v) => !v)}
                  part={scopeExpanded ? "head" : "all"}
                />
              </div>
              {scopeExpanded ? (
                <ScopeTag
                  jurisdiction={multiDistrict.jurisdiction}
                  districtSlugs={multiDistrict.districts}
                  expanded={scopeExpanded}
                  onExpandToggle={() => setScopeExpanded((v) => !v)}
                  part="tail"
                />
              ) : null}
            </div>
          ) : null}
        </Section>

        <Section title="Reaction buttons">
          <Row>
            <ReactionButtons
              up={132}
              down={7}
              selected={reaction}
              onReact={(d) => setReaction((r) => (r === d ? null : d))}
            />
          </Row>
        </Section>

        <Section title="Petition progress">
          <div className="rounded-xl border border-border bg-surface p-4">
            <PetitionProgress
              sig={POST_PETITION.sig ?? 0}
              goal={POST_PETITION.goal ?? 1}
              attachedPoll={POST_PETITION.attachedPoll}
              tierMin={TIER_MIN}
            >
              <Button variant="outline" size="sm">
                Sign the Petition
              </Button>
            </PetitionProgress>
          </div>
        </Section>

        <Section title="Poll options — live vs result outcome">
          <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
            {POST_POLL.options ? (
              <PollOptions
                options={POST_POLL.options}
                selectedVote={vote}
                onVote={(l) => setVote((v) => (v === l ? null : l))}
              />
            ) : null}
            {POST_RESULT.options ? (
              <ResultOutcome options={POST_RESULT.options} />
            ) : null}
          </div>
        </Section>

        <Section title="Feed cards — one per record kind">
          <div className="space-y-3">
            {feedSamples.map((item) => (
              <FeedCard
                key={item.id}
                item={item}
                viewer={VIEWER}
                tierMin={TIER_MIN}
              />
            ))}
          </div>
        </Section>

        <Section title="Comment thread (nested to depth 3)">
          <div className="rounded-xl border border-border bg-surface p-4">
            <CommentThread
              nodes={COMMENTS_STATEMENT}
              viewer={VIEWER}
              now={NOW}
              tierMin={TIER_MIN}
            />
          </div>
        </Section>

        <Section title="Record interlinks">
          <div className="rounded-xl border border-border bg-surface p-4">
            <RecordTypeSection
              detail={POST_PETITION}
              onSeeFullPoll={() => {}}
            />
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <RecordTypeSection
              detail={POST_POLL}
              petitionPreview={{
                title: POST_PETITION.title,
                sig: POST_PETITION.sig ?? 0,
                goal: POST_PETITION.goal ?? 1,
              }}
              resultPreview={{ options: POST_RESULT.options ?? [] }}
            />
          </div>
        </Section>

        <Section title="Chrome — filter & jurisdiction">
          <div className="flex flex-wrap gap-4">
            {filterOpen ? (
              <FilterDropdown
                includedKinds={includedKinds}
                onToggleKind={(k) =>
                  setIncludedKinds((cur) =>
                    cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k],
                  )
                }
                onIsolateKind={(k) => setIncludedKinds([k])}
                onAllKinds={() => setIncludedKinds([...oneOfEach])}
                verifiedLevel={verified}
                onCycleVerified={() =>
                  setVerified((v) => ((v + 1) % 4) as VerificationTier)
                }
                myDistricts={myDistricts}
                onCycleMyDistricts={() => setMyDistricts(nextGeoFilterMode)}
                signedFilter={signedFilter}
                onCycleSignedFilter={() =>
                  setSignedFilter((v) => nextSignedFilterLevel(v))
                }
                showAffected
                affected={affected}
                onCycleAffected={() => setAffected(nextGeoFilterMode)}
                viewer={VIEWER}
              />
            ) : null}
            {jurOpen ? (
              <JurisdictionSelector
                subscriptions={[{ name: "Global", included: true }]}
                onToggleInclude={() => {}}
                onAllJurisdictions={() => {}}
                onSelectOnly={() => {}}
                onOpenJurisdiction={() => {}}
                onAddJurisdiction={() => setAddJurOpen(true)}
              />
            ) : null}
          </div>
          <Row>
            <Button size="sm" variant="ghost" onClick={() => setFilterOpen((v) => !v)}>
              Toggle filter
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setJurOpen((v) => !v)}>
              Toggle jurisdictions
            </Button>
          </Row>
        </Section>

        <Section title="Chrome — modals">
          <Row>
            <Button size="sm" variant="outline" onClick={() => setAuthOpen(true)}>
              Auth chooser
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRegisterOpen(true)}>
              Register
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOtpOpen(true)}>
              OTP verify
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLoginOtp(false);
                setLoginOpen(true);
              }}
            >
              Login (passkey)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLoginOtp(true);
                setLoginOpen(true);
              }}
            >
              Login (OTP)
            </Button>
            <Button size="sm" variant="outline" onClick={() => setProfileOpen(true)}>
              Profile
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setComposeStep("where");
                setComposeJur(undefined);
                setComposeType(undefined);
                setComposeOpen(true);
              }}
            >
              Compose
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSignOpen(true)}>
              Sign (WYSIWYS)
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddJurOpen(true)}>
              Add jurisdiction
            </Button>
          </Row>
        </Section>
      </div>

      {/* Modals */}
      <AuthChooser
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onRegister={() => {
          setAuthOpen(false);
          setRegisterOpen(true);
        }}
        onLogin={() => {
          setAuthOpen(false);
          setLoginOpen(true);
        }}
      />
      <RegisterForm
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSubmit={() => {
          setRegisterOpen(false);
          setOtpOpen(true);
        }}
      />
      <OtpVerify open={otpOpen} onClose={() => setOtpOpen(false)} />
      <LoginChooser
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        otpWindow={loginOtp}
      />
      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        name={MY_NAME}
        handle="alexmorgan"
        kycTier={VIEWER.kycTier}
      />
      <ComposeFlow
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        step={composeStep}
        jurisdictions={["Global", "Alberta"]}
        kycTier={VIEWER.kycTier}
        selectedJurisdiction={composeJur}
        onSelectJurisdiction={(name) => {
          setComposeJur(name);
          setComposeStep(composeStep === "compose" ? "compose" : "type");
        }}
        allowedTypes={rootTypesForJurisdiction(composeJur ?? "Global")}
        selectedType={composeType}
        onSelectType={(k) => {
          setComposeType(k);
          setComposeStep("compose");
        }}
        onChangeType={() => setComposeStep("type")}
        onPost={() => setComposeOpen(false)}
      />
      <SignModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        kind="petition"
        signerName={MY_NAME}
        targetTitle={POST_PETITION.title}
        onConfirm={() => setSignOpen(false)}
      />
      <AddJurisdictionModal
        open={addJurOpen}
        onClose={() => setAddJurOpen(false)}
        subscriptions={[{ name: "Global", included: true }]}
      />
    </main>
  );
}
