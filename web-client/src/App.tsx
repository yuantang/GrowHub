import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import Dashboard from '@/pages/Dashboard'
import DataView from '@/pages/DataView'
import DataAnalysis from '@/pages/DataAnalysis'
import AccountsPage from '@/pages/AccountsPage'
import CheckpointsPage from '@/pages/CheckpointsPage'
import KeywordsPage from '@/pages/KeywordsPage'
import ContentMonitorPage from '@/pages/ContentMonitorPage'
import NotificationPage from '@/pages/NotificationPage'
import RulesPage from '@/pages/RulesPage'
import HotspotsPage from '@/pages/HotspotsPage'
import SmartCreatorPage from '@/pages/SmartCreatorPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="data" element={<DataView />} />
          <Route path="analysis" element={<DataAnalysis />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="checkpoints" element={<CheckpointsPage />} />
          {/* GrowHub Routes */}
          <Route path="keywords" element={<KeywordsPage />} />
          <Route path="monitor" element={<ContentMonitorPage />} />
          <Route path="hotspots" element={<HotspotsPage />} />
          <Route path="ai-creator" element={<SmartCreatorPage />} />
          <Route path="notifications" element={<NotificationPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App


