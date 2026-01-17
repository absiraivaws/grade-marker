
import React, { useState, useEffect } from 'react';
import { UserRole, Assignment, Submission } from './types';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

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

  const handleCreateAssignment = (newAssignment: Assignment) => {
    setAssignments([...assignments, newAssignment]);
  };

  const handleAddSubmission = (newSubmission: Submission) => {
    setSubmissions([...submissions, newSubmission]);
  };

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
          <h1 className="text-4xl font-extrabold text-slate-800 mb-2">SmartGrader</h1>
          <p className="text-slate-500 mb-8">AI-Powered Classroom Assessment</p>
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
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">S</div>
            <span className="text-xl font-bold text-slate-800">SmartGrader</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-sm font-medium">
              Mode: {role}
            </span>
            <button 
              onClick={() => setRole(null)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Switch Role
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
