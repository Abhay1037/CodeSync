import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';

/**
 * App
 * ---
 * Router wiring. Routes:
 *   /          -> dashboard (or login for guests)
 *   /login     -> auth form
 *   /dashboard -> room hub (create/join/list)
 *   /room/:id  -> the restrictive split-pane workspace
 */
export default function App() {
  const { user, ready } = useAuth();

  // Wait for the stored session to be validated before routing.
  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 text-sm text-slate-600">
        Loading…
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/room/:roomId" element={<WorkspacePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}