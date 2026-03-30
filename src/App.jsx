import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import NewNewsletterPage from './pages/NewNewsletterPage'
import NewsletterDetailPage from './pages/NewsletterDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/newsletters/new" element={<NewNewsletterPage />} />
        <Route path="/newsletters/:id" element={<NewsletterDetailPage />} />
      </Routes>
    </BrowserRouter>
  )
}
