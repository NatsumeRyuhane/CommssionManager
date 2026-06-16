import { Eye, EyeOff, Link2 } from "lucide-react";
import type { ReactNode } from "react";

import type { Visibility } from "../api/types";

/** Cycle-toggle visibility control. Click advances through
 * `Inherit → Public → Private → Inherit`.
 *
 * Visual rules:
 *
 * - **Enabled (editable)** → outlined: white background, colored border + text.
 *   Tone color comes from the *forced* override when one is set, or from the
 *   *effective* value when the row is on Inherit. A dashed border on the
 *   inherit tones disambiguates "this is inherited" from "this is forced" so
 *   the user can tell them apart even though the colors match.
 *
 * - **Locked** (`lockedReason` set, e.g. the detached node which is always
 *   private) → solid fill in the tone color, white icon/text. The fill is
 *   the visual cue that the row's value is fixed and not editable; the
 *   tooltip surfaces *why* it's locked. Click is disabled.
 *
 * - **Transiently disabled** (`disabled=true`, e.g. a stage that's busy mid-
 *   reorder) → outlined like normal but with reduced opacity. Distinct from
 *   the lock state because the value is still editable — just temporarily
 *   blocked.
 *
 * Compact mode hides the label and renders icon-only — used inside file tile
 * action rows where horizontal space is at a premium.
 */
export function VisibilityToggle({
  value,
  effective,
  onChange,
  disabled = false,
  lockedReason,
  compact = false,
  ariaLabel,
}: {
  value: Visibility | null;
  effective: Visibility;
  onChange: (next: Visibility | null) => void;
  /** Transient disable (e.g. a sibling operation is in flight). The button is
   * not clickable but stays in the editable look (outlined). */
  disabled?: boolean;
  /** Permanent lock with the *why* surfaced in the tooltip. Implies disabled
   * AND switches the visual to the locked look (solid fill). */
  lockedReason?: string;
  /** Hide the text label and render the button as icon-only. */
  compact?: boolean;
  ariaLabel?: string;
}) {
  const view = describeVisibility(value, effective);
  const next = cycleVisibility(value);
  const tooltip = lockedReason
    ? lockedReason
    : `Visibility: ${view.tooltip} — click to set ${describeVisibility(next, effective).label}`;
  return (
    <CycleButton
      tone={view.tone}
      icon={view.icon}
      label={view.label}
      tooltip={tooltip}
      compact={compact}
      disabled={disabled || Boolean(lockedReason)}
      locked={Boolean(lockedReason)}
      ariaLabel={ariaLabel ?? `Visibility: ${view.label}`}
      onClick={() => onChange(next)}
    />
  );
}

/** Same cycle-toggle for boolean field-level visibility (the per-field
 * `*_public` columns). `true` ↔ public, `false` ↔ private, `null` ↔ inherit. */
export function FieldVisibilityToggle({
  value,
  effective,
  onChange,
  disabled = false,
  lockedReason,
  compact = false,
  ariaLabel,
}: {
  value: boolean | null;
  effective: boolean;
  onChange: (next: boolean | null) => void;
  disabled?: boolean;
  lockedReason?: string;
  compact?: boolean;
  ariaLabel?: string;
}) {
  // Reuse the Visibility describe/cycle by mapping bool|null ↔ Visibility|null.
  const asVis: Visibility | null =
    value === null ? null : value ? "public" : "private";
  const effectiveVis: Visibility = effective ? "public" : "private";
  const view = describeVisibility(asVis, effectiveVis);
  const nextVis = cycleVisibility(asVis);
  const nextBool: boolean | null =
    nextVis === null ? null : nextVis === "public";
  const tooltip = lockedReason
    ? lockedReason
    : `Visibility: ${view.tooltip} — click to set ${describeVisibility(nextVis, effectiveVis).label}`;
  return (
    <CycleButton
      tone={view.tone}
      icon={view.icon}
      label={view.label}
      tooltip={tooltip}
      compact={compact}
      disabled={disabled || Boolean(lockedReason)}
      locked={Boolean(lockedReason)}
      ariaLabel={ariaLabel ?? `Visibility: ${view.label}`}
      onClick={() => onChange(nextBool)}
    />
  );
}

// ---------------------------------------------------------------- internals

type Tone = "public" | "private" | "inherit-public" | "inherit-private";

interface View {
  tone: Tone;
  icon: ReactNode;
  label: string;
  /** Verbose form used inside the tooltip ("Inherit (currently public)"
   * vs the button's short label "Inherit"). */
  tooltip: string;
}

function describeVisibility(value: Visibility | null, effective: Visibility): View {
  if (value === "public") {
    return {
      tone: "public",
      icon: <Eye size={14} strokeWidth={2} />,
      label: "Public",
      tooltip: "Public (forced)",
    };
  }
  if (value === "private") {
    return {
      tone: "private",
      icon: <EyeOff size={14} strokeWidth={2} />,
      label: "Private",
      tooltip: "Private (forced)",
    };
  }
  return {
    tone: effective === "public" ? "inherit-public" : "inherit-private",
    icon: <Link2 size={14} strokeWidth={2} />,
    label: "Inherit",
    tooltip: `Inherit (currently ${effective})`,
  };
}

/** Cycle order: `Inherit → Public → Private → Inherit`. Inherit is the
 * "default" state and stays the natural starting point. */
function cycleVisibility(value: Visibility | null): Visibility | null {
  if (value === null) return "public";
  if (value === "public") return "private";
  return null;
}

function CycleButton({
  tone,
  icon,
  label,
  tooltip,
  compact,
  disabled,
  locked,
  ariaLabel,
  onClick,
}: {
  tone: Tone;
  icon: ReactNode;
  label: string;
  tooltip: string;
  compact: boolean;
  disabled: boolean;
  locked: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  const cls = [
    "visibility-cycle",
    `tone-${tone}`,
    locked ? "locked" : "",
    compact ? "compact" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      disabled={disabled}
      onClick={onClick}
      title={tooltip}
      aria-label={ariaLabel}
    >
      {icon}
      {!compact && <span>{label}</span>}
    </button>
  );
}
