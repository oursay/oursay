"use client";

import type { ProfileRoleTag } from "@/lib/types";

export type RoleTagPart = "all" | "head" | "tail";

interface RoleTagProps {
  roles: ProfileRoleTag[];
  expanded?: boolean;
  onExpandToggle?: () => void;
  onRoleClick?: (tag: ProfileRoleTag) => void;
  onPlaceClick?: (tag: ProfileRoleTag) => void;
  part?: RoleTagPart;
}

const LINK =
  "underline underline-offset-2 hover:text-ink-soft disabled:no-underline disabled:cursor-default";

const LINE = "text-right text-xs leading-4 text-ink-soft";

function RoleItem({
  tag,
  suffix,
  onRoleClick,
  onPlaceClick,
}: {
  tag: ProfileRoleTag;
  suffix?: string;
  onRoleClick?: (tag: ProfileRoleTag) => void;
  onPlaceClick?: (tag: ProfileRoleTag) => void;
}) {
  return (
    <>
      <button type="button" className={LINK} onClick={() => onRoleClick?.(tag)}>
        {tag.roleLabel}
      </button>
      {tag.placeLabel ? (
        <>
          {" · "}
          <button type="button" className={LINK} onClick={() => onPlaceClick?.(tag)}>
            {tag.placeLabel}
          </button>
        </>
      ) : null}
      {suffix ?? null}
    </>
  );
}

/**
 * Right-aligned official role tags with +N collapse (same pattern as ScopeTag).
 * Each tag is "Role · Place" with both segments clickable when linked.
 */
export function RoleTag({
  roles,
  expanded = false,
  onExpandToggle,
  onRoleClick,
  onPlaceClick,
  part = "all",
}: RoleTagProps) {
  if (roles.length === 0) return null;

  if (part === "tail") {
    if (!expanded || roles.length <= 1) return null;
    const rest = roles.slice(1);
    return (
      <div className="relative w-full min-w-0">
        <div className={LINE}>
          {rest.map((tag, i) => (
            <span key={tag.seatHandle ?? `${tag.roleLabel}-${tag.placeLabel}`}>
              <RoleItem tag={tag} onRoleClick={onRoleClick} onPlaceClick={onPlaceClick} />
              {i < rest.length - 1 ? ", " : " · "}
            </span>
          ))}
          <button type="button" className={LINK} onClick={onExpandToggle}>
            See Less
          </button>
        </div>
      </div>
    );
  }

  if (roles.length <= 1) {
    return (
      <span className={`${LINE} whitespace-nowrap`}>
        <RoleItem tag={roles[0]!} onRoleClick={onRoleClick} onPlaceClick={onPlaceClick} />
      </span>
    );
  }

  if (!expanded) {
    return (
      <span className={`${LINE} whitespace-nowrap`}>
        <RoleItem tag={roles[0]!} onRoleClick={onRoleClick} onPlaceClick={onPlaceClick} />{" "}
        <button type="button" className={LINK} onClick={onExpandToggle}>
          +{roles.length - 1}
        </button>
      </span>
    );
  }

  if (part === "head") {
    return (
      <span className={`${LINE} whitespace-nowrap`}>
        <RoleItem tag={roles[0]!} suffix="," onRoleClick={onRoleClick} onPlaceClick={onPlaceClick} />
      </span>
    );
  }

  return null;
}
