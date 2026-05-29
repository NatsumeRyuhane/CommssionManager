import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./hooks/useAuth";
import { DetailPage } from "./pages/DetailPage";
import { EditPage } from "./pages/EditPage";
import { GalleryPage } from "./pages/GalleryPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<GalleryPage />} />
          <Route path="/commissions/new" element={<EditPage />} />
          <Route path="/commissions/:id" element={<DetailPage />} />
          <Route path="/commissions/:id/edit" element={<EditPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
