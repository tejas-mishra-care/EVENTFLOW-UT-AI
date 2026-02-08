import React, { ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { CreateEvent } from './pages/CreateEvent';
import { EventDetails } from './pages/EventDetails';
import { VolunteerLogin } from './pages/VolunteerLogin';
import { Scanner } from './pages/Scanner';
import { PublicRegistration } from './pages/PublicRegistration';
import { SpotEntry } from './pages/SpotEntry';
import { PrintStation } from './pages/PrintStation';
import { GuestEntry } from './pages/GuestEntry';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastProvider } from './components/Toast';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public props: ErrorBoundaryProps;
  public state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-600 bg-red-50 min-h-screen flex flex-col items-center justify-center text-center">
          <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
          <p className="mb-4 text-slate-700">Please refresh the page or contact support.</p>
          <pre className="text-xs bg-white p-4 rounded border border-red-200 overflow-auto max-w-lg text-left">
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            
            {/* Protected Routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/create-event" element={
              <ProtectedRoute>
                <CreateEvent />
              </ProtectedRoute>
            } />
            <Route path="/event/:id" element={
              <ProtectedRoute>
                <EventDetails />
              </ProtectedRoute>
            } />

            {/* Public / Volunteer Routes */}
            <Route path="/volunteer-login" element={<VolunteerLogin />} />
            <Route path="/volunteer/:eventId/scan" element={<Scanner />} />
            <Route path="/register/:eventId" element={<PublicRegistration />} />
            <Route path="/spot-entry/:eventId" element={<SpotEntry />} />
            <Route path="/print-station/:eventId" element={<PrintStation />} />
            <Route path="/guest-entry/:eventId" element={<GuestEntry />} />
            
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;