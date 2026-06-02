import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { LoginModal } from "./LoginModal";

export function TopBar({ children }: { children?: ReactNode }) {
  const { canWrite, me, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  return (
    <div className="topbar">
      <Link to="/">
        <h1>Heiyao&rsquo;s commissions</h1>
      </Link>
      <span className="spacer" />
      {children}
      <span style={{ width: 1, height: 20, background: "var(--rule)" }} />
      {canWrite ? (
        <>
          <span className="mono-sm muted">🔓 {me?.kind === "admin" ? "admin" : me?.label}</span>
          {me?.kind === "admin" && (
            <>
              <Link to="/artists" className="btn sm">
                Artists
              </Link>
              <Link to="/settings" className="btn sm">
                Settings
              </Link>
            </>
          )}
          <button className="btn sm" onClick={() => void logout()}>
            Sign out
          </button>
        </>
      ) : (
        <button className="btn sm" onClick={() => setShowLogin(true)}>
          🔒 Sign in
        </button>
      )}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
