
import React, { useState, useEffect } from 'react';
import { UserRole, Assignment, Submission } from './types';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('sg_theme');
    return saved === 'dark';
  });

  // Load from local storage for simulation
  useEffect(() => {
    const savedAssignments = localStorage.getItem('sg_assignments');
    const savedSubmissions = localStorage.getItem('sg_submissions');
    if (savedAssignments) setAssignments(JSON.parse(savedAssignments));
    if (savedSubmissions) setSubmissions(JSON.parse(savedSubmissions));
  }, []);

  useEffect(() => {
    localStorage.setItem('sg_assignments', JSON.stringify(assignments));
  }, [assignments]);

  useEffect(() => {
    localStorage.setItem('sg_submissions', JSON.stringify(submissions));
  }, [submissions]);

  // Sync theme with DOM and localStorage
  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('sg_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('sg_theme', 'light');
    }
  }, [isDarkMode]);

  const handleCreateAssignment = (newAssignment: Assignment) => {
    setAssignments([...assignments, newAssignment]);
  };

  const handleAddSubmission = (newSubmission: Submission) => {
    setSubmissions([...submissions, newSubmission]);
  };

  const toggleTheme = () => setIsDarkMode(prev => !prev);

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-slate-900 dark:to-indigo-950 p-6 transition-colors duration-300">
        <button 
          onClick={toggleTheme}
          className="fixed top-6 right-6 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-all z-50 border border-white/20"
          aria-label="Toggle Theme"
        >
          {isDarkMode ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M16.071 16.071l.707.707M7.636 7.636l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
          )}
        </button>
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-10 max-w-md w-full text-center transition-all">
          <h1 className="text-4xl font-extrabold text-slate-800 dark:text-white mb-2">SmartGrader</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8">AI-Powered Classroom Assessment</p>
          <div className="space-y-4">
            <button 
              onClick={() => setRole(UserRole.TEACHER)}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all transform hover:scale-105"
            >
              I am a Teacher
            </button>
            <button 
              onClick={() => setRole(UserRole.STUDENT)}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all transform hover:scale-105"
            >
              I am a Student
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <nav className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">S</div>
            <span className="text-xl font-bold text-slate-800 dark:text-white">SmartGrader</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent dark:border-slate-700"
              aria-label="Toggle Theme"
            >
              {isDarkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M16.071 16.071l.707.707M7.636 7.636l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
            <span className="hidden sm:inline px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full text-sm font-medium">
              {role}
            </span>
            <button 
              onClick={() => setRole(null)}
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {role === UserRole.TEACHER ? (
          <TeacherDashboard 
            assignments={assignments} 
            submissions={submissions}
            onCreateAssignment={handleCreateAssignment} 
          />
        ) : (
          <StudentDashboard 
            assignments={assignments} 
            submissions={submissions}
            onNewSubmission={handleAddSubmission}
          />
        )}
      </main>
    </div>
  );
};

export default App;
