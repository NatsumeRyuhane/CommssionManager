import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";

import { api } from "../api/client";
import type { CharacterPageCommission } from "../api/types";
import { Chip } from "./Chip";
import { Cover } from "./Cover";

interface Props {
  title: string;
  characterId: number;
  excludeSetId?: number;
  singleSelect?: boolean;
  initialSelection?: number[];
  onClose: () => void;
  onConfirm: (commissionIds: number[]) => void | Promise<void>;
}

/** Modal that lists commissions an admin can add to a character page set
 *  (or pin as a main reference). Defaults to commissions tagged with the
 *  character; falling back to all of them is a one-click filter. */
export function CommissionPickerModal({
  title,
  characterId,
  excludeSetId,
  singleSelect = false,
  initialSelection = [],
  onClose,
  onConfirm,
}: Props) {
  const [onlyTagged, setOnlyTagged] = useState(true);
  const [search, setSearch] = useState("");
  const [pool, setPool] = useState<CharacterPageCommission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>(initialSelection);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listEligibleCommissions(characterId, {
        onlyTagged,
        excludeSetId,
      })
      .then((items) => {
        if (!cancelled) setPool(items);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [characterId, onlyTagged, excludeSetId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return pool;
    return pool.filter((c) => c.title.toLowerCase().includes(needle));
  }, [pool, search]);

  function toggle(id: number) {
    if (singleSelect) {
      setSelected([id]);
      return;
    }
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(selected);
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong style={{ fontSize: 15 }}>{title}</strong>
            <button className="btn sm ghost" onClick={onClose} aria-label="close">
              <X />
            </button>
          </div>
          <div className="row gap-8" style={{ marginTop: 10, flexWrap: "wrap" }}>
            <input
              className="field"
              style={{ flex: 1, minWidth: 180 }}
              placeholder="Filter by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <button
              className="btn sm"
              onClick={() => setOnlyTagged((v) => !v)}
              title={onlyTagged ? "Showing only tagged commissions" : "Showing every commission"}
            >
              {onlyTagged && <Check />}
              {onlyTagged ? "tagged only" : "all commissions"}
            </button>
          </div>
        </div>
        <div className="picker-grid">
          {loading && <div className="mono-sm muted">Loading…</div>}
          {error && <div className="error-text mono-sm">{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="mono-sm muted">No matching commissions.</div>
          )}
          {!loading &&
            filtered.map((c) => {
              const isSelected = selected.includes(c.commission_id);
              return (
                <div
                  key={c.commission_id}
                  className={`picker-tile${isSelected ? " selected" : ""}`}
                  onClick={() => toggle(c.commission_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(c.commission_id);
                    }
                  }}
                >
                  <Cover cover={c.cover} rounded={false} size="thumb" />
                  <span className="check">{isSelected && <Check size={11} strokeWidth={3} />}</span>
                  <div className="title">{c.title}</div>
                </div>
              );
            })}
        </div>
        <div className="picker-foot">
          <span className="mono-sm muted" style={{ flex: 1 }}>
            {singleSelect ? (
              selected.length ? <Chip kind="char">selected</Chip> : "Pick one commission"
            ) : (
              `${selected.length} commission${selected.length === 1 ? "" : "s"} selected`
            )}
          </span>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => void confirm()}
            disabled={busy || selected.length === 0}
          >
            {busy ? "Saving…" : singleSelect ? "Pin selection" : `Add ${selected.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
