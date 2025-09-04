import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/contexts/AuthContext';
import { AuthErrorBoundary } from '@/features/login/components/AuthErrorBoundary';
import { PrivateRoute } from '@/features/login/components/PrivateRoute';
import { ToastProvider } from '@/lib/hooks/useToast';
import { SocketProvider } from '@/lib/contexts/SocketContext';
import LoginPage from './features/login/page/LoginPage';
import DashboardPage from './features/dashboard/page/DashboardPage';
import DatabasePage from './features/database/page/DatabasePage';
import AuthenticationPage from './features/auth/page/AuthenticationPage';
import LogsPage from './features/logs/page/LogsPage';
import AnalyticsLogsPage from './features/logs/page/AnalyticsLogsPage';
import StoragePage from './features/storage/page/StoragePage';
import MetadataPage from './features/metadata/page/MetadataPage';
import OnBoardPage from './features/onboard/page/OnBoardPage';
import VisualizerPage from './features/visualizer/page/VisualizerPage';
import Layout from './components/layout/Layout';
import { OnboardStepProvider } from './lib/contexts/OnboardStepContext';
import CloudLayout from './components/layout/CloudLayout';
import CloudLoginPage from './features/login/page/CloudLoginPage';
import AIPage from './features/ai/page/AIPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthErrorBoundary>
        <AuthProvider>
          <SocketProvider>
            <ToastProvider>
              <OnboardStepProvider>
                <AppRoutes />
              </OnboardStepProvider>
            </ToastProvider>
          </SocketProvider>
        </AuthProvider>
      </AuthErrorBoundary>
    </QueryClientProvider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/dashboard/login" element={<LoginPage />} />
      <Route path="/cloud/login" element={<CloudLoginPage />} />
      <Route
        path="/cloud/*"
        element={
          <PrivateRoute classname="bg-neutral-800">
            <CloudLayout>
              <Routes>
                <Route path="/" element={<Navigate to="/cloud/dashboard" replace />} />
                <Route path="/visualizer" element={<VisualizerPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/authentication" element={<AuthenticationPage />} />
                <Route path="/database" element={<DatabasePage />} />
                <Route path="/storage" element={<StoragePage />} />
                <Route path="/analytics" element={<AnalyticsLogsPage />} />
                <Route path="/ai" element={<AIPage />} />
                <Route path="*" element={<Navigate to="/cloud/dashboard" replace />} />
              </Routes>
            </CloudLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/*"
        element={
          <PrivateRoute classname="bg-bg-gray">
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/dashboard/authentication" element={<AuthenticationPage />} />
                <Route path="/dashboard/database" element={<DatabasePage />} />
                <Route path="/dashboard/storage" element={<StoragePage />} />
                <Route path="/dashboard/logs" element={<LogsPage />} />
                <Route path="/dashboard/analytics" element={<AnalyticsLogsPage />} />
                <Route path="/dashboard/metadata" element={<MetadataPage />} />
                <Route path="/dashboard/onboard" element={<OnBoardPage />} />
                <Route path="/dashboard/ai" element={<AIPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

export default App;
