import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { LoginModal } from "./LoginModal";

const DEFAULT_SITE_TITLE = "Commissions";

export function TopBar({ children, siteTitle }: { children?: ReactNode; siteTitle?: string }) {
  const { canWrite, me, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [resolvedTitle, setResolvedTitle] = useState(siteTitle ?? DEFAULT_SITE_TITLE);

  useEffect(() => {
    if (siteTitle !== undefined) {
      setResolvedTitle(siteTitle || DEFAULT_SITE_TITLE);
      return;
    }

    let active = true;
    api
      .getSiteSettings()
      .then((settings) => {
        if (active) setResolvedTitle(settings.site_title || DEFAULT_SITE_TITLE);
      })
      .catch(() => {
        if (active) setResolvedTitle(DEFAULT_SITE_TITLE);
      });
    return () => {
      active = false;
    };
  }, [siteTitle]);

  return (
    <div className="topbar">
      <Link to="/">
        <h1>{resolvedTitle}</h1>
      </Link>
      <span className="spacer" />
      {children}
      <span style={{ width: 1, height: 20, background: "var(--rule)" }} />
      {canWrite ? (
        <>
          <span className="mono-sm muted">🔓 {me?.kind === "admin" ? "admin" : me?.label}</span>
          {me?.kind === "admin" && (
            <Link to="/settings" className="btn sm">
              Settings
            </Link>
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
