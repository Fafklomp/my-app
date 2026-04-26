import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import NewNewsletterPage from './pages/NewNewsletterPage'
import NewsletterDetailPage from './pages/NewsletterDetailPage'
import AudiencesPage from './pages/AudiencesPage'
import PublishedUpdatePage from './pages/PublishedUpdatePage'
import AvailabilityPage from './pages/AvailabilityPage'
import GooglePhotosCallback from './pages/GooglePhotosCallback'
import SpotifyCallbackPage from './pages/SpotifyCallbackPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/newsletters/new" element={<NewNewsletterPage />} />
        <Route path="/newsletters/:id" element={<NewsletterDetailPage />} />
        <Route path="/audiences" element={<AudiencesPage />} />
        <Route path="/update/:versionId" element={<PublishedUpdatePage />} />
        <Route path="/availability" element={<AvailabilityPage />} />
        <Route path="/auth/google-photos/callback" element={<GooglePhotosCallback />} />
        <Route path="/callbacks/spotify" element={<SpotifyCallbackPage />} />
      </Routes>
    </BrowserRouter>
  )
}
