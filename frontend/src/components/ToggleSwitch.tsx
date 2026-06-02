export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = "md",
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`toggle-switch ${checked ? "on" : ""} ${size}`}
      aria-pressed={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
