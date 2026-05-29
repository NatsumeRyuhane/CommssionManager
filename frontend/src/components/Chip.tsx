import type { ReactNode } from "react";

type ChipKind = "cat" | "tag" | "rating" | "char" | "artist";

export function Chip({
  kind = "tag",
  ghost = false,
  onRemove,
  children,
}: {
  kind?: ChipKind;
  ghost?: boolean;
  onRemove?: () => void;
  children: ReactNode;
}) {
  return (
    <span className={`chip ${ghost ? "ghost" : kind}`}>
      {children}
      {onRemove && (
        <span className="x" onClick={onRemove}>
          ✕
        </span>
      )}
    </span>
  );
}
