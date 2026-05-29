import { useState } from "react";

import { ApiError } from "../api/client";
import { useAuth } from "../hooks/useAuth";

export function LoginModal({ onClose }: { onClose: () => void }) {
  const { login } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Sign in to edit</h2>
        <div className="mono-sm" style={{ marginBottom: 16 }}>
          Public browsing needs no login. Sign in for admin edit access.
        </div>
        <label className="label">Username</label>
        <input
          className="field"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <div style={{ height: 10 }} />
        <label className="label">Password</label>
        <input
          className="field"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
