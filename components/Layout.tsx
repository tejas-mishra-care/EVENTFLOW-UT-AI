
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Calendar, PlusCircle, Scan, User, LayoutDashboard, Menu, X } from 'lucide-react';
import { logoutUser } from '../services/db';

interface LayoutProps {
  children: React.ReactNode;
  userRole?: 'owner' | 'volunteer';
}

export const Layout: React.FC<LayoutProps> = ({ children, userRole = 'owner' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);

  const handleLogout = () => {
    logoutUser();
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path ? "bg-indigo-700 text-white" : "text-indigo-100 hover:bg-indigo-600";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-indigo-800 text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Scan className="w-6 h-6" />
          EventFlow
        </div>
        <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
            className="p-2 hover:bg-indigo-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Sidebar / Navbar */}
      <nav className={`
        bg-indigo-800 text-white 
        w-full ${isDesktopSidebarOpen ? 'md:w-64' : 'md:w-0'}
        flex-shrink-0 md:min-h-screen
        fixed md:static top-[60px] md:top-0 z-40 transition-[transform,width] duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        ${isDesktopSidebarOpen ? 'md:translate-x-0' : 'md:-translate-x-full md:absolute'}
        h-[calc(100vh-60px)] md:h-auto overflow-y-auto flex flex-col shadow-2xl md:shadow-none
      `}>
        {/* Mobile-only internal close button (Redundant but requested for clarity) */}
        <div className="md:hidden flex justify-between items-center p-4 border-b border-indigo-700 bg-indigo-900/50">
             <span className="text-indigo-200 text-sm font-medium uppercase tracking-wider">Menu</span>
             <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1 text-indigo-200 hover:text-white hover:bg-indigo-700 rounded transition-colors"
             >
                 <X size={20} />
             </button>
        </div>

        <div className="p-6 hidden md:flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scan className="w-8 h-8" />
            EventFlow
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-xs text-indigo-300 uppercase tracking-wider">{userRole} Portal</p>
            <button
              onClick={() => setIsDesktopSidebarOpen(false)}
              className="ml-2 p-2 rounded hover:bg-indigo-700 text-indigo-200"
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 space-y-2 flex-1 pt-4 md:pt-2">
          {userRole === 'owner' ? (
            <>
              <Link 
                to="/dashboard" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('/dashboard')}`}
              >
                <LayoutDashboard size={20} />
                Dashboard
              </Link>
              <Link 
                to="/create-event" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('/create-event')}`}
              >
                <PlusCircle size={20} />
                Create Event
              </Link>
            </>
          ) : (
             <div className="px-4 py-3 bg-indigo-900 rounded-lg">
                <p className="text-sm font-medium">Volunteer Mode</p>
                <p className="text-xs text-indigo-300 mt-1">Scanning Active</p>
             </div>
          )}
          
          <div className="border-t border-indigo-700 my-4 pt-4">
             <Link 
                to="/volunteer-login" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive('/volunteer-login')}`}
             >
                <User size={20} />
                Volunteer Portal
              </Link>
          </div>
        </div>

        <div className="p-4 mt-auto">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 text-red-200 hover:text-white hover:bg-red-900/50 w-full rounded-lg transition-colors"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto w-full h-[calc(100vh-60px)] md:h-screen">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
      
      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* Desktop sidebar opener */}
      {!isDesktopSidebarOpen && (
        <button
          onClick={() => setIsDesktopSidebarOpen(true)}
          className="hidden md:flex fixed left-2 top-2 z-30 items-center gap-2 bg-indigo-800 text-white px-3 py-2 rounded-lg shadow hover:bg-indigo-700"
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <Menu size={18} />
          Menu
        </button>
      )}
    </div>
  );
};
