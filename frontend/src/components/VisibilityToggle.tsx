import { Eye, EyeOff, Link2 } from "lucide-react";
import type { ReactNode } from "react";

import type { Visibility } from "../api/types";

/** Cycle-toggle visibility control. Click advances through
 * `Inherit → Public → Private → Inherit`. One button instead of a segmented
 * group keeps the rail and stage header tight while still encoding the state
 * with color + icon:
 *
 * - **Public override** — filled accent (green), `Eye` icon, "Public" label.
 * - **Private override** — filled warn (warm red), `EyeOff` icon, "Private" label.
 * - **Inherit** — outlined with the *effective* tone, `Link2` icon ("linked
 *   to the parent's setting"), "Inherit" label. The outlined vs filled
 *   distinction is what tells the reader "this row isn't locked in — it
 *   follows the parent's setting" while still showing what it currently
 *   resolves to.
 *
 * Compact mode hides the label and renders icon-only — used inside file
 * tile action rows where horizontal space is a premium.
 */
export function VisibilityToggle({
  value,
  effective,
  onChange,
  disabled = false,
  compact = false,
  ariaLabel,
}: {
  value: Visibility | null;
  effective: Visibility;
  onChange: (next: Visibility | null) => void;
  disabled?: boolean;
  /** Hide the text label and render the button as icon-only. */
  compact?: boolean;
  ariaLabel?: string;
}) {
  const view = describeVisibility(value, effective);
  const next = cycleVisibility(value);
  return (
    <CycleButton
      tone={view.tone}
      icon={view.icon}
      label={view.label}
      tooltip={`Visibility: ${view.tooltip} — click to set ${describeVisibility(next, effective).label}`}
      compact={compact}
      disabled={disabled}
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
  compact = false,
  ariaLabel,
}: {
  value: boolean | null;
  effective: boolean;
  onChange: (next: boolean | null) => void;
  disabled?: boolean;
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
  return (
    <CycleButton
      tone={view.tone}
      icon={view.icon}
      label={view.label}
      tooltip={`Visibility: ${view.tooltip} — click to set ${describeVisibility(nextVis, effectiveVis).label}`}
      compact={compact}
      disabled={disabled}
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
  // value === null → inherit; borrow the effective tone for color
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
  ariaLabel,
  onClick,
}: {
  tone: Tone;
  icon: ReactNode;
  label: string;
  tooltip: string;
  compact: boolean;
  disabled: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`visibility-cycle tone-${tone}${compact ? " compact" : ""}`}
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
