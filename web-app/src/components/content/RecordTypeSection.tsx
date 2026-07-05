"use client";

import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Vote,
} from "lucide-react";
import type { RecordDetail, RecordOption } from "@/lib/types";
import { Button, CollapsibleSection } from "@/components/ui";
import { PollOptions } from "./PollOptions";
import { ResultOutcome } from "./ResultOutcome";
import { formatCount } from "@/components/utils";

/** A previewed linked record (the wireframe references the representative sample). */
interface PetitionPreview {
  title: string;
  sig: number;
  goal: number;
}
interface PollPreview {
  title: string;
  options: RecordOption[];
}

interface RecordTypeSectionProps {
  detail: RecordDetail;
  petitionPreview?: PetitionPreview;
  pollPreview?: PollPreview;
  resultPreview?: { options: RecordOption[] };
  onSeeFullPetition?: () => void;
  onSeeFullPoll?: () => void;
  onSeeFullResult?: () => void;
}

function PetitionCaption({ sig, goal }: { sig: number; goal: number }) {
  return (
    <p className="text-sm text-ink-soft">
      {formatCount(sig)} / {formatCount(goal)} signatures
    </p>
  );
}

/**
 * Type-specific interlink sections (petition proposed-poll, poll source
 * petition/result, result poll/petition), props-driven and collapsible. Mirrors
 * the wireframe's buildPost interlinks without any routing.
 */
export function RecordTypeSection({
  detail,
  petitionPreview,
  pollPreview,
  resultPreview,
  onSeeFullPetition,
  onSeeFullPoll,
  onSeeFullResult,
}: RecordTypeSectionProps) {
  const [petPollOpen, setPetPollOpen] = useState(false);
  const [sourcePetOpen, setSourcePetOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resPollOpen, setResPollOpen] = useState(false);
  const [resPetOpen, setResPetOpen] = useState(false);

  const graduated =
    detail.kind === "petition" &&
    !!detail.attachedPoll &&
    (detail.sig ?? 0) >= (detail.goal ?? Infinity);

  return (
    <div className="space-y-3">
      {/* Petition -> proposed / graduated poll */}
      {detail.kind === "petition" && detail.attachedPoll ? (
        <CollapsibleSection
          icon={BarChart3}
          label={graduated ? "Poll" : "Proposed Poll"}
          open={petPollOpen}
          onToggle={() => setPetPollOpen((v) => !v)}
        >
          <p className="mb-2 text-sm font-medium text-ink">
            {detail.attachedPoll.question}
          </p>
          <ul className="space-y-1.5">
            {detail.attachedPoll.options.map((label) => (
              <li
                key={label}
                className={`rounded-lg border border-border px-3 py-2 text-sm ${graduated ? "text-ink-soft" : "text-muted"}`}
              >
                {label}
              </li>
            ))}
          </ul>
          {graduated ? (
            <Button
              variant="outline"
              size="sm"
              icon={ArrowRight}
              className="mt-3"
              onClick={onSeeFullPoll}
            >
              See full Poll
            </Button>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Graduates automatically once this petition reaches{" "}
              {formatCount(detail.goal ?? 0)} signatures.
            </p>
          )}
        </CollapsibleSection>
      ) : null}

      {/* Poll -> source petition */}
      {detail.kind === "poll" && detail.sourcePetition && petitionPreview ? (
        <CollapsibleSection
          icon={ClipboardList}
          label="Source Petition"
          open={sourcePetOpen}
          onToggle={() => setSourcePetOpen((v) => !v)}
        >
          <p className="mb-1 text-sm font-medium text-ink">
            {petitionPreview.title}
          </p>
          <PetitionCaption sig={petitionPreview.sig} goal={petitionPreview.goal} />
          <Button
            variant="outline"
            size="sm"
            icon={ArrowRight}
            className="mt-3"
            onClick={onSeeFullPetition}
          >
            See full Petition
          </Button>
        </CollapsibleSection>
      ) : null}

      {/* Poll -> published result */}
      {detail.kind === "poll" && detail.resultPublished && resultPreview ? (
        <CollapsibleSection
          icon={Vote}
          label="Result"
          open={resultOpen}
          onToggle={() => setResultOpen((v) => !v)}
        >
          <ResultOutcome options={resultPreview.options} />
          <Button
            variant="outline"
            size="sm"
            icon={ArrowRight}
            className="mt-3"
            onClick={onSeeFullResult}
          >
            See full Result
          </Button>
        </CollapsibleSection>
      ) : null}

      {/* Result -> source poll */}
      {detail.kind === "result" && detail.sourcePoll && pollPreview ? (
        <CollapsibleSection
          icon={BarChart3}
          label="Poll"
          open={resPollOpen}
          onToggle={() => setResPollOpen((v) => !v)}
        >
          <p className="mb-2 text-sm font-medium text-ink">{pollPreview.title}</p>
          <PollOptions options={pollPreview.options} frozen />
          <Button
            variant="outline"
            size="sm"
            icon={ArrowRight}
            className="mt-3"
            onClick={onSeeFullPoll}
          >
            See full Poll
          </Button>
        </CollapsibleSection>
      ) : null}

      {/* Result -> source petition (transitive) */}
      {detail.kind === "result" && detail.sourcePetition && petitionPreview ? (
        <CollapsibleSection
          icon={ClipboardList}
          label="Petition"
          open={resPetOpen}
          onToggle={() => setResPetOpen((v) => !v)}
        >
          <p className="mb-1 text-sm font-medium text-ink">
            {petitionPreview.title}
          </p>
          <PetitionCaption sig={petitionPreview.sig} goal={petitionPreview.goal} />
          <Button
            variant="outline"
            size="sm"
            icon={ArrowRight}
            className="mt-3"
            onClick={onSeeFullPetition}
          >
            See full Petition
          </Button>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
