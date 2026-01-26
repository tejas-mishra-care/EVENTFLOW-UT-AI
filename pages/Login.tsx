
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../services/db';
import { Scan, Loader2 } from 'lucide-react';
import { useToast } from '../components/Toast';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { addToast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    try {
        await loginUser(email, password);
        addToast("Logged in successfully", "success");
        navigate('/dashboard');
    } catch (e: any) {
        console.error(e);
        addToast(e.message || "Failed to login. Check credentials.", "error");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-4 rotate-3 shadow-lg">
                <Scan size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">EventFlow</h1>
            <p className="text-slate-500">Event Management System</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input 
                    type="email" 
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input 
                    type="password" 
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
            </div>
            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
                {loading ? <Loader2 className="animate-spin" /> : "Sign In"}
            </button>
        </form>
        
        <div className="mt-8 pt-6 border-t border-slate-100 text-center space-y-4">
             <a href="#/signup" className="block text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                Create new account
             </a>
             <a href="#/volunteer-login" className="block text-slate-500 hover:text-slate-700 text-sm font-medium">
                Are you a volunteer? Login here &rarr;
             </a>
        </div>
      </div>
    </div>
  );
};
