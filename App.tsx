
import React, { useState, useEffect } from 'react';
import { UserRole, Assignment, Submission } from './types';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [activeTab, setActiveTab] = useState('assignments');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('sg_theme');
    return saved === 'dark';
  });

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

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('sg_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(prev => !prev);

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-900 p-6 transition-colors duration-500">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl p-12 max-w-md w-full text-center border border-white/20">
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-4xl font-black mx-auto mb-6 shadow-xl shadow-indigo-500/20">S</div>
          <h1 className="text-4xl font-black text-slate-800 dark:text-white mb-2 tracking-tight">SmartGrader</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-10 font-medium">Elevating education with AI</p>
          <div className="space-y-4">
            <button 
              onClick={() => { setRole(UserRole.TEACHER); setActiveTab('assignments'); }}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all transform hover:scale-[1.02] shadow-lg shadow-indigo-200 dark:shadow-none"
            >
              I am a Teacher
            </button>
            <button 
              onClick={() => { setRole(UserRole.STUDENT); setActiveTab('tasks'); }}
              className="w-full py-4 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold transition-all transform hover:scale-[1.02] hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm"
            >
              I am a Student
            </button>
          </div>
          <button onClick={toggleTheme} className="mt-8 text-slate-400 hover:text-indigo-500 transition-colors text-sm font-semibold flex items-center justify-center gap-2 mx-auto">
            {isDarkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <nav className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-[100]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setRole(null)}>
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">S</div>
                <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">SmartGrader</span>
              </div>
              
              <div className="hidden md:flex items-center gap-1">
                {role === UserRole.TEACHER ? (
                  <>
                    <NavBtn active={activeTab === 'assignments'} onClick={() => setActiveTab('assignments')} label="Assignments" />
                    <NavBtn active={activeTab === 'grades'} onClick={() => setActiveTab('grades')} label="Grades" />
                    <NavBtn active={activeTab === 'students'} onClick={() => setActiveTab('students')} label="Students" />
                  </>
                ) : (
                  <>
                    <NavBtn active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} label="My Tasks" />
                    <NavBtn active={activeTab === 'my-grades'} onClick={() => setActiveTab('my-grades')} label="Results" />
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button onClick={toggleTheme} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                {isDarkMode ? '☀️' : '🌙'}
              </button>
              <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block"></div>
              <div className="flex items-center gap-3 pl-2">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-bold uppercase text-slate-400 tracking-widest">{role}</p>
                  <button onClick={() => setRole(null)} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Logout</button>
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 border-2 border-white dark:border-slate-800 shadow-md"></div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {role === UserRole.TEACHER ? (
          <TeacherDashboard 
            activeTab={activeTab}
            assignments={assignments} 
            submissions={submissions}
            onCreateAssignment={(a) => setAssignments([a, ...assignments])}
            onUpdateSubmission={(s) => setSubmissions(submissions.map(x => x.id === s.id ? s : x))}
          />
        ) : (
          <StudentDashboard 
            activeTab={activeTab}
            assignments={assignments} 
            submissions={submissions}
            onNewSubmission={(s) => setSubmissions([s, ...submissions])}
          />
        )}
      </main>
    </div>
  );
};

const NavBtn = ({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) => (
  <button 
    onClick={onClick}
    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
      active 
        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' 
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
    }`}
  >
    {label}
  </button>
);

export default App;
