import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./hooks/useAuth";
import { ArtistsPage } from "./pages/ArtistsPage";
import { DetailPage } from "./pages/DetailPage";
import { EditPage } from "./pages/EditPage";
import { GalleryPage } from "./pages/GalleryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VisibilityPage } from "./pages/VisibilityPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<GalleryPage />} />
          <Route path="/commissions/new" element={<EditPage />} />
          <Route path="/commissions/:id" element={<DetailPage />} />
          <Route path="/commissions/:id/edit" element={<EditPage />} />
          <Route path="/commissions/:id/visibility" element={<VisibilityPage />} />
          <Route path="/artists" element={<ArtistsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
