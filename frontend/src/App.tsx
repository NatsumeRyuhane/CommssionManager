import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./hooks/useAuth";
import { CharacterPage } from "./pages/CharacterPage";
import { CharactersDirectoryPage } from "./pages/CharactersDirectoryPage";
import { DetailPage } from "./pages/DetailPage";
import { EditPage } from "./pages/EditPage";
import { GalleryPage } from "./pages/GalleryPage";
import { SettingsPage } from "./pages/SettingsPage";

/**
 * Root application component that provides authentication context and client-side routing.
 *
 * Renders the app wrapped with AuthProvider and BrowserRouter and declares routes:
 * - `/` → GalleryPage
 * - `/commissions/:id` → DetailPage (admins are redirected to the edit route on entry)
 * - `/commissions/:id/edit` → EditPage (visibility toggles are inline, no separate page)
 * - `/artists` → redirects to `/settings` (replace)
 * - `/settings` → SettingsPage
 *
 * Bookmarks to the legacy `/commissions/:id/visibility` route fall through to
 * the catch-all redirect into the edit page.
 *
 * @returns The root React element for the application
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<GalleryPage />} />
          <Route path="/commissions/:id" element={<DetailPage />} />
          <Route path="/commissions/:id/edit" element={<EditPage />} />
          {/* Visibility was its own page until inline toggles landed; preserve
              the URL so existing bookmarks land somewhere useful. */}
          <Route
            path="/commissions/:id/visibility"
            element={<Navigate to=".." relative="path" replace />}
          />
          <Route path="/characters" element={<CharactersDirectoryPage />} />
          <Route path="/characters/:id" element={<CharacterPage />} />
          <Route path="/artists" element={<Navigate to="/settings" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
