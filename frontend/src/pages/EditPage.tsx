import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { CommissionCreate, Rating } from "../api/types";
import { Chip } from "../components/Chip";
import { StagesEditor } from "../components/StagesEditor";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const joinList = (xs: string[]) => xs.join(", ");

const RATINGS: { value: Rating; label: string }[] = [
  { value: "general", label: "General" },
  { value: "mature", label: "Mature" },
  { value: "adult", label: "Adult" },
];

export function EditPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { canWrite, loading: authLoading } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [confirmedAt, setConfirmedAt] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState("USD");
  const [rating, setRating] = useState<Rating>("general");
  const [categories, setCategories] = useState("");
  const [tags, setTags] = useState("");
  const [characters, setCharacters] = useState("");
  const [artists, setArtists] = useState("");
  const [nodes, setNodes] = useState("Sketching, Lineart, Color, Delivered");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit || !id) return;
    api.getCommission(Number(id)).then((d) => {
      setTitle(d.title);
      setDescription(d.description ?? "");
      setCompletedAt(d.completed_at ?? "");
      setConfirmedAt(d.confirmed_at ? d.confirmed_at.slice(0, 10) : "");
      setPriceAmount(d.price_amount ?? "");
      setPriceCurrency(d.price_currency ?? "USD");
      setRating(d.rating ?? "general");
      setCategories(joinList(d.categories));
      setTags(joinList(d.tags));
      setCharacters(joinList(d.characters));
      setArtists(joinList(d.artists));
    });
  }, [id, isEdit]);

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
    const payload: CommissionCreate = {
      title: title.trim(),
      description: description || null,
      completed_at: completedAt || null,
      confirmed_at: confirmedAt || null,
      price_amount: priceAmount || null,
      price_currency: priceAmount ? priceCurrency : null,
      rating,
      category_names: splitList(categories),
      tag_names: splitList(tags),
      character_names: splitList(characters),
      artist_names: splitList(artists),
    };
    try {
      if (isEdit && id) {
        await api.updateCommission(Number(id), payload);
        navigate(`/commissions/${id}`);
      } else {
        const created = await api.createCommission({ ...payload, node_names: splitList(nodes) });
        navigate(`/commissions/${created.id}/edit`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <TopBar>
        <span className="mono-sm muted">{isEdit ? "editing" : "new commission"}</span>
        <button
          type="button"
          className="btn sm"
          onClick={() => (isEdit && id ? navigate(`/commissions/${id}`) : navigate(-1))}
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
          {busy ? "Saving…" : isEdit ? "✓ Save" : "✓ Create"}
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

          {isEdit && id ? (
            <div style={{ marginTop: 18 }}>
              <StagesEditor commissionId={Number(id)} />
            </div>
          ) : (
            <div className="settings-panel" style={{ marginTop: 18 }}>
              <div className="settings-panel-title">Lifecycle stages</div>
              <input
                className="field"
                value={nodes}
                onChange={(e) => setNodes(e.target.value)}
                placeholder="Sketching, Lineart, Color, Delivered"
              />
              <div className="mono-sm muted" style={{ marginTop: 6 }}>
                Comma-separated. After creating, you can upload files into each stage.
              </div>
            </div>
          )}

          {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}
        </div>

        <aside className="edit-rail">
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
            <input
              className="field"
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              placeholder="comma-separated"
            />
            <ChipPreview kind="cat" values={splitList(categories)} />
          </FieldGroup>
          <FieldGroup label="Tags">
            <input
              className="field"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="comma-separated"
            />
            <ChipPreview kind="tag" values={splitList(tags)} />
          </FieldGroup>
          <FieldGroup label="Characters">
            <input
              className="field"
              value={characters}
              onChange={(e) => setCharacters(e.target.value)}
              placeholder="comma-separated"
            />
            <ChipPreview kind="char" values={splitList(characters)} />
          </FieldGroup>
          <FieldGroup label="Artists">
            <input
              className="field"
              value={artists}
              onChange={(e) => setArtists(e.target.value)}
              placeholder="comma-separated"
            />
            <ChipPreview kind="artist" values={splitList(artists)} />
          </FieldGroup>

          {isEdit && id && (
            <Link to={`/commissions/${id}/visibility`} className="btn" style={{ justifyContent: "center" }}>
              👁 Edit visibility
            </Link>
          )}
        </aside>
      </form>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="edit-field-group">
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

function ChipPreview({
  kind,
  values,
}: {
  kind: "cat" | "tag" | "char" | "artist";
  values: string[];
}) {
  if (values.length === 0) return null;
  return (
    <div className="row wrap gap-4" style={{ marginTop: 6 }}>
      {values.map((v) => (
        <Chip key={v} kind={kind}>
          {v}
        </Chip>
      ))}
    </div>
  );
}
