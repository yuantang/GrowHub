import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Toaster } from "sonner";
import Dashboard from "@/pages/Dashboard";
import DataView from "@/pages/DataView";
import AccountsPage from "@/pages/AccountsPage";
import CheckpointsPage from "@/pages/CheckpointsPage";
import KeywordsPage from "@/pages/KeywordsPage";
import ContentMonitorPage from "@/pages/ContentMonitorPage";
import NotificationPage from "@/pages/NotificationPage";
import RulesPage from "@/pages/RulesPage";
import HotspotsPage from "@/pages/HotspotsPage";
import SmartCreatorPage from "@/pages/SmartCreatorPage";
import SchedulerPage from "@/pages/SchedulerPage";
import AccountPoolPage from "@/pages/AccountPoolPage";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import SettingsPage from "@/pages/SettingsPage";
import CreatorsPage from "@/pages/CreatorsPage";
import SentimentPage from "@/pages/SentimentPage";
import UserManagementPage from "@/pages/admin/UserManagementPage";
import PluginStatusPage from "@/pages/PluginStatusPage";
import AnalyticsDashboardPage from "@/pages/AnalyticsDashboardPage";

import { AuthProvider } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="data" element={<DataView />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="checkpoints" element={<CheckpointsPage />} />
            {/* GrowHub Routes */}
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="keywords" element={<KeywordsPage />} />
            <Route path="monitor" element={<ContentMonitorPage />} />
            <Route path="hotspots" element={<HotspotsPage />} />
            <Route path="creators" element={<CreatorsPage />} />
            <Route path="sentiment" element={<SentimentPage />} />
            <Route path="ai-creator" element={<SmartCreatorPage />} />
            <Route path="scheduler" element={<SchedulerPage />} />
            <Route path="account-pool" element={<AccountPoolPage />} />
            <Route path="notifications" element={<NotificationPage />} />
            <Route path="rules" element={<RulesPage />} />
            <Route path="notifications" element={<NotificationPage />} />
            <Route path="rules" element={<RulesPage />} />
            <Route path="plugin-status" element={<PluginStatusPage />} />
            <Route path="analytics" element={<AnalyticsDashboardPage />} />

            {/* Admin Only Routes */}
            <Route
              path="settings"
              element={
                <AdminRoute>
                  <SettingsPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/users"
              element={
                <AdminRoute>
                  <UserManagementPage />
                </AdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <Toaster />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
