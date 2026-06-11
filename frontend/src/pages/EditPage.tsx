import { useEffect, useState } from "react";
import { Check, Eye } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { CommissionUpdate, Rating } from "../api/types";
import { Chip } from "../components/Chip";
import { CoverFocalEditor, type StagedFocal } from "../components/CoverFocalEditor";
import { StagesEditor } from "../components/StagesEditor";
import { TaxonomyPicker } from "../components/TaxonomyPicker";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

const RATINGS: { value: Rating; label: string }[] = [
  { value: "general", label: "General" },
  { value: "mature", label: "Mature" },
  { value: "adult", label: "Adult" },
];

/**
 * Render the commission edit page, including form fields, taxonomy pickers, cover/stages editors, and submission handling.
 *
 * Commissions are created up front from the site's stage template (see GalleryPage), so this page
 * always edits an existing commission: it loads the data, enforces write authorization, manages
 * local form state (title, description, dates, price, rating, taxonomies), and submits an update
 * request that navigates to the commission detail route on success.
 *
 * @returns The React element for the commission edit page.
 */
export function EditPage() {
  const { id } = useParams();
  const commissionId = Number(id);
  const navigate = useNavigate();
  const { canWrite, loading: authLoading } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [confirmedAt, setConfirmedAt] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState("USD");
  const [rating, setRating] = useState<Rating>("general");
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverVersion, setCoverVersion] = useState(0);
  const bumpCoverVersion = () => setCoverVersion((v) => v + 1);
  // focal edits stage here and commit together with the form submit
  const [pendingFocal, setPendingFocal] = useState<StagedFocal | null>(null);

  useEffect(() => {
    if (!commissionId) return;
    api.getCommission(commissionId).then((d) => {
      setTitle(d.title);
      setDescription(d.description ?? "");
      setCompletedAt(d.completed_at ?? "");
      setConfirmedAt(d.confirmed_at ? d.confirmed_at.slice(0, 10) : "");
      setPriceAmount(d.price_amount ?? "");
      setPriceCurrency(d.price_currency ?? "USD");
      setRating(d.rating ?? "general");
      setCategories(d.categories);
      setTags(d.tags);
      setCharacters(d.characters);
      setArtists(d.artists);
    });
  }, [commissionId]);

  if (!authLoading && !canWrite) {
    return (
      <div className="app">
        <TopBar />
        <div style={{ padding: 48, textAlign: "center" }} className="muted">
          Editing requires admin sign-in.
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload: CommissionUpdate = {
      title: title.trim(),
      description: description || null,
      completed_at: completedAt || null,
      confirmed_at: confirmedAt || null,
      price_amount: priceAmount || null,
      price_currency: priceAmount ? priceCurrency : null,
      rating,
      category_names: categories,
      tag_names: tags,
      character_names: characters,
      artist_names: artists,
    };
    try {
      await api.updateCommission(commissionId, payload);
      if (pendingFocal) {
        await api.setFocal(
          pendingFocal.fileId,
          pendingFocal.x,
          pendingFocal.y,
          pendingFocal.zoom,
        );
      }
      navigate(`/commissions/${commissionId}`);
    } catch (err) {
      // stay on the page: form fields and any staged focal edit are kept
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <TopBar>
        <span className="mono-sm muted">editing</span>
        <button
          type="button"
          className="btn sm"
          onClick={() => navigate(`/commissions/${commissionId}`)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn sm primary"
          form="commission-edit-form"
          onClick={(e) => {
            const form = (e.currentTarget.form ??
              document.getElementById("commission-edit-form")) as HTMLFormElement | null;
            form?.requestSubmit();
          }}
          disabled={busy}
        >
          {!busy && <Check />}
          {busy ? "Saving…" : "Save"}
        </button>
      </TopBar>

      <form id="commission-edit-form" onSubmit={submit} className="edit-page">
        <div className="edit-main">
          <input
            className="field edit-title-input"
            value={title}
            placeholder="Untitled commission"
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="field edit-description-input"
            rows={2}
            placeholder="Description…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div style={{ marginTop: 18 }}>
            <StagesEditor commissionId={commissionId} onChange={bumpCoverVersion} />
          </div>

          {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}
        </div>

        <aside className="edit-rail">
          <CoverFocalEditor
            commissionId={commissionId}
            version={coverVersion}
            onStage={setPendingFocal}
          />
          <FieldGroup label="Completed">
            <input
              className="field"
              type="date"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Confirmed">
            <input
              className="field"
              type="date"
              value={confirmedAt}
              onChange={(e) => setConfirmedAt(e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Price">
            <div className="row gap-4">
              <input
                className="field"
                style={{ flex: 1 }}
                value={priceAmount}
                onChange={(e) => setPriceAmount(e.target.value)}
                placeholder="0"
              />
              <select
                className="field"
                style={{ width: 80 }}
                value={priceCurrency}
                onChange={(e) => setPriceCurrency(e.target.value)}
              >
                <option>USD</option>
                <option>JPY</option>
                <option>CNY</option>
                <option>EUR</option>
              </select>
            </div>
          </FieldGroup>

          <FieldGroup label="Rating · pick one">
            <div className="row gap-4 wrap">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRating(r.value)}
                  className="chip-button"
                >
                  <Chip kind="rating" ghost={rating !== r.value}>
                    {rating === r.value ? "✓ " : ""}
                    {r.label}
                  </Chip>
                </button>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup label="Categories">
            <TaxonomyPicker kind="category" values={categories} onChange={setCategories} />
          </FieldGroup>
          <FieldGroup label="Tags">
            <TaxonomyPicker kind="tag" values={tags} onChange={setTags} />
          </FieldGroup>
          <FieldGroup label="Characters">
            <TaxonomyPicker kind="character" values={characters} onChange={setCharacters} />
          </FieldGroup>
          <FieldGroup label="Artists">
            <TaxonomyPicker kind="artist" values={artists} onChange={setArtists} />
          </FieldGroup>

          <Link to={`/commissions/${commissionId}/visibility`} className="btn">
            <Eye />
            Edit visibility
          </Link>
        </aside>
      </form>
    </div>
  );
}

/**
 * Renders a labeled wrapper for a form section.
 *
 * @param label - The text shown as the group's label
 * @param children - The contents of the field group
 * @returns A JSX element containing the label and the group's children
 */
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="edit-field-group">
      <div className="label">{label}</div>
      {children}
    </div>
  );
}
