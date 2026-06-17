import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";

type ChipKind = "cat" | "tag" | "rating" | "char" | "artist" | "status";

/** Small, color-coded tag pill.
 *
 *  Pass `to` to turn the chip into a router link (used by character chips
 *  that route to their page). When `hasPage` is true a small "page exists"
 *  marker is rendered before the label so the reader can distinguish
 *  characters with shareable pages from ones without one.
 */
export function Chip({
  kind = "tag",
  ghost = false,
  onRemove,
  to,
  hasPage = false,
  children,
}: {
  kind?: ChipKind;
  ghost?: boolean;
  onRemove?: () => void;
  to?: string;
  hasPage?: boolean;
  children: ReactNode;
}) {
  const body = (
    <>
      {hasPage && (
        <span aria-label="has page" title="has character page" style={{ fontSize: 9 }}>
          ◉
        </span>
      )}
      {children}
      {onRemove && (
        <span className="x" onClick={onRemove} role="button" aria-label="remove">
          <X />
        </span>
      )}
    </>
  );
  const className = `chip ${ghost ? "ghost" : kind}`;
  if (to) {
    return (
      <Link to={to} className={className} style={{ textDecoration: "none" }}>
        {body}
      </Link>
    );
  }
  return <span className={className}>{body}</span>;
}
