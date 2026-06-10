import { useEffect, useState, type ReactNode } from "react";
import { LogIn, LogOut, Settings, UnlockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { LoginModal } from "./LoginModal";

const DEFAULT_SITE_TITLE = "Commissions";

/**
 * Render the application's top navigation bar including the site title, optional children, and authentication controls.
 *
 * If `siteTitle` is provided (including an empty string), it will be used (falling back to the default title when falsy). If `siteTitle` is omitted, site settings are fetched and the returned `site_title` is used, falling back to the default title on error.
 *
 * @param children - Optional nodes rendered between the title and the authentication controls
 * @param siteTitle - Optional explicit site title; when omitted the component will fetch site settings to determine the title
 * @returns The top bar element containing the resolved title, any `children`, and sign-in/sign-out/admin controls
 */
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
      <span className="topbar-divider" />
      {canWrite ? (
        <>
          <span className="mono-sm muted inline-ic">
            <UnlockKeyhole size={12} />
            {me?.kind === "admin" ? "admin" : me?.label}
          </span>
          {me?.kind === "admin" && (
            <Link to="/settings" className="btn sm" title="Admin settings">
              <Settings />
              Settings
            </Link>
          )}
          <button className="btn sm" onClick={() => void logout()}>
            <LogOut />
            Sign out
          </button>
        </>
      ) : (
        <button className="btn sm" onClick={() => setShowLogin(true)}>
          <LogIn />
          Sign in
        </button>
      )}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
