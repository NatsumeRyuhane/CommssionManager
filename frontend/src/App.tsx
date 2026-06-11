import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./hooks/useAuth";
import { CharacterPage } from "./pages/CharacterPage";
import { CharactersDirectoryPage } from "./pages/CharactersDirectoryPage";
import { DetailPage } from "./pages/DetailPage";
import { EditPage } from "./pages/EditPage";
import { GalleryPage } from "./pages/GalleryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VisibilityPage } from "./pages/VisibilityPage";

/**
 * Root application component that provides authentication context and client-side routing.
 *
 * Renders the app wrapped with AuthProvider and BrowserRouter and declares routes:
 * - `/` → GalleryPage
 * - `/commissions/:id` → DetailPage
 * - `/commissions/:id/edit` → EditPage
 * - `/commissions/:id/visibility` → VisibilityPage
 * - `/artists` → redirects to `/settings` (replace)
 * - `/settings` → SettingsPage
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
          <Route path="/commissions/:id/visibility" element={<VisibilityPage />} />
          <Route path="/characters" element={<CharactersDirectoryPage />} />
          <Route path="/characters/:id" element={<CharacterPage />} />
          <Route path="/artists" element={<Navigate to="/settings" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
