import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { CommissionCreate, Rating } from "../api/types";
import { TopBar } from "../components/TopBar";
import { useAuth } from "../hooks/useAuth";

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const joinList = (xs: string[]) => xs.join(", ");

export function EditPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { canWrite, loading: authLoading } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [completedAt, setCompletedAt] = useState("");
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
      setRating(d.rating);
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
        navigate(`/commissions/${created.id}`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <TopBar />
      <form onSubmit={submit} style={{ maxWidth: 720, margin: "0 auto", padding: "28px 24px" }}>
        <h1 style={{ marginTop: 0 }}>{isEdit ? "Edit commission" : "New commission"}</h1>

        <Field label="Title *">
          <input className="field lg" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea
            className="field"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="row gap-16" style={{ alignItems: "flex-start" }}>
          <Field label="Completed date">
            <input
              className="field"
              type="date"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
            />
          </Field>
          <Field label="Rating">
            <select
              className="field"
              value={rating}
              onChange={(e) => setRating(e.target.value as Rating)}
            >
              <option value="general">General</option>
              <option value="mature">Mature</option>
              <option value="adult">Adult</option>
            </select>
          </Field>
        </div>
        <Field label="Categories (comma-separated)">
          <input className="field" value={categories} onChange={(e) => setCategories(e.target.value)} />
        </Field>
        <Field label="Tags (comma-separated)">
          <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Field label="Characters (comma-separated)">
          <input className="field" value={characters} onChange={(e) => setCharacters(e.target.value)} />
        </Field>
        <Field label="Artists (comma-separated)">
          <input className="field" value={artists} onChange={(e) => setArtists(e.target.value)} />
        </Field>
        {!isEdit && (
          <Field label="Lifecycle stages (comma-separated)">
            <input className="field" value={nodes} onChange={(e) => setNodes(e.target.value)} />
          </Field>
        )}

        {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create"}
          </button>
        </div>
        {!isEdit && (
          <div className="mono-sm muted" style={{ marginTop: 12 }}>
            Files can be uploaded to each stage after creating the commission (API:
            POST /api/v1/nodes/{"{node_id}"}/files).
          </div>
        )}
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, flex: 1 }}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
