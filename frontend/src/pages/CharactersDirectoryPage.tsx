import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type { Character, CharacterPageDirectoryItem } from "../api/types";
import { Chip } from "../components/Chip";
import { Cover } from "../components/Cover";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

/** Public directory of characters with shareable pages.
 *
 *  Admins additionally see characters that don't have a page yet, with a
 *  "Create page" shortcut alongside each.
 */
export function CharactersDirectoryPage() {
  const { canWrite } = useAuth();
  const [pages, setPages] = useState<CharacterPageDirectoryItem[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.listCharacterPages(), canWrite ? api.characters() : Promise.resolve([])])
      .then(([dir, chars]) => {
        if (cancelled) return;
        setPages(dir);
        setCharacters(chars as Character[]);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canWrite]);

  const withPageIds = new Set(pages.map((p) => p.character_id));
  const characterByIdWithoutPage = characters.filter((c) => !withPageIds.has(c.id));

  return (
    <div className="app">
      <TopBar>
        <span className="mono-sm muted">{pages.length} characters</span>
      </TopBar>

      <div className="detail-crumb">
        <Link to="/" className="mono-sm muted">
          ← gallery
        </Link>
        <span className="mono-sm muted">/</span>
        <strong className="detail-crumb-title">Characters</strong>
      </div>

      {loading && (
        <div style={{ padding: 24 }} className="mono-sm">
          Loading…
        </div>
      )}
      {error && (
        <div style={{ padding: 24 }} className="error-text">
          {error}
        </div>
      )}

      {!loading && !error && pages.length === 0 && (
        <div className="char-directory-empty">
          No character pages yet.
          {canWrite && " Pick a character below to start one."}
        </div>
      )}

      {pages.length > 0 && (
        <div className="char-directory">
          {pages.map((p) => (
            <Link key={p.character_id} to={`/characters/${p.character_id}`} className="char-directory-card">
              <div className="face">
                <Cover cover={p.main_reference?.cover ?? null} rounded={false} />
              </div>
              <div className="meta">
                <h3>{p.character_name}</h3>
                <div className="row gap-4 wrap" style={{ marginTop: 6 }}>
                  <Chip kind="char">{p.commission_count_total} commissions</Chip>
                  <Chip kind="char">{p.set_count} sets</Chip>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {canWrite && characterByIdWithoutPage.length > 0 && (
        <div style={{ padding: "12px 24px 32px" }}>
          <div className="label">Characters without a page</div>
          <div className="row wrap gap-4" style={{ marginTop: 6 }}>
            {characterByIdWithoutPage.map((c) => (
              <Link key={c.id} to={`/characters/${c.id}`} className="btn sm">
                + {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
