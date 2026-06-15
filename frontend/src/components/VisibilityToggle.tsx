import type { Visibility } from "../api/types";

/**
 * Three-state visibility selector used inline next to every component that has
 * a visibility override (commission, stage, file, field). The control renders
 * a compact <select> so it tucks into existing rails and stage headers; the
 * native widget gives keyboard/screen-reader behavior for free.
 *
 * `value === null` means "inherit" — the field/stage/file follows the next
 * level up (site default → commission → stage). The effective value is shown
 * inside the "Inherit (X)" option so the user can see what they'll fall back
 * to without opening the dropdown.
 */
export function VisibilityToggle({
  value,
  effective,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  value: Visibility | null;
  effective: Visibility;
  onChange: (next: Visibility | null) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select
      className="field visibility-toggle"
      value={value ?? ""}
      onChange={(e) =>
        onChange((e.target.value || null) as Visibility | null)
      }
      disabled={disabled}
      aria-label={ariaLabel}
      title={
        disabled
          ? "Detached content is always private"
          : `Effective: ${effective}`
      }
    >
      <option value="">Inherit ({effective})</option>
      <option value="public">Public</option>
      <option value="private">Private</option>
    </select>
  );
}

/** Same three-state control for boolean field-level visibility (`*_public`
 * columns) — public/private/null map to true/false/inherit. */
export function FieldVisibilityToggle({
  value,
  effective,
  onChange,
  ariaLabel,
}: {
  value: boolean | null;
  effective: boolean;
  onChange: (next: boolean | null) => void;
  ariaLabel?: string;
}) {
  return (
    <select
      className="field visibility-toggle"
      value={value == null ? "" : value ? "public" : "private"}
      onChange={(e) => {
        const next = e.target.value;
        onChange(next === "" ? null : next === "public");
      }}
      aria-label={ariaLabel}
      title={`Effective: ${effective ? "public" : "private"}`}
    >
      <option value="">Inherit ({effective ? "public" : "private"})</option>
      <option value="public">Public</option>
      <option value="private">Private</option>
    </select>
  );
}
