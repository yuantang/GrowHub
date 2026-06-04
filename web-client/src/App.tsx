import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Toaster } from "sonner";
import HotspotsPage from "@/pages/HotspotsPage";
import ScriptWorkbenchPage from "@/pages/ScriptWorkbenchPage";
import VideoRemixPage from "@/pages/VideoRemixPage";
import RemixWorkflowPage from "@/pages/RemixWorkflowPage";
import AccountPoolPage from "@/pages/AccountPoolPage";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import DataMonitorPage from "@/pages/DataMonitorPage";
import SettingsPage from "@/pages/SettingsPage";
import AutoPublishPage from "@/pages/AutoPublishPage";
import ImageGenPage from "@/pages/ImageGenPage";
import ImageGenHistoryPage from "@/pages/ImageGenHistoryPage";
import UserManagementPage from "@/pages/admin/UserManagementPage";
import { AuthProvider } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="p-8">Loading...</div>;

  if (!user || user.role !== "admin") {
    return <Navigate to="/projects" replace />;
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
            <Route index element={<Navigate to="/projects" replace />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="hotspots" element={<HotspotsPage />} />
            <Route path="data-monitor" element={<DataMonitorPage />} />
            <Route path="ai-creator" element={<ScriptWorkbenchPage />} />
            <Route path="video-remix" element={<VideoRemixPage />} />
            <Route path="remix-workflow" element={<RemixWorkflowPage />} />
            <Route path="auto-publish" element={<AutoPublishPage />} />
            <Route path="image-gen" element={<ImageGenPage />} />
            <Route path="image-gen-history" element={<ImageGenHistoryPage />} />
            <Route path="account-pool" element={<AccountPoolPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="admin/users"
              element={
                <AdminRoute>
                  <UserManagementPage />
                </AdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Route>
        </Routes>
        <Toaster />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
