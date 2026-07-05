import {
  BarChart3,
  ClipboardList,
  Feather,
  Vote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RecordKind } from "@/lib/types";

/** Record-kind glyph (statement/petition/poll/result), mirroring the wireframe icons. */
export const RECORD_TYPE_ICON: Record<RecordKind, LucideIcon> = {
  statement: Feather,
  petition: ClipboardList,
  poll: BarChart3,
  result: Vote,
};

/** Product label per record kind. */
export const RECORD_TYPE_LABEL: Record<RecordKind, string> = {
  statement: "Statement",
  petition: "Petition",
  poll: "Poll",
  result: "Result",
};
