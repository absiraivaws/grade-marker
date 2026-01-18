
import React, { useState, useMemo } from 'react';
import { Assignment, Submission } from '../types';
import { analyzeAnswer } from '../services/geminiService';

interface Props {
  activeTab: string;
  assignments: Assignment[];
  submissions: Submission[];
  onNewSubmission: (s: Submission) => void;
}

const StudentDashboard: React.FC<Props> = ({ activeTab, assignments, submissions, onNewSubmission }) => {
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [studentName, setStudentName] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmissionResult, setLastSubmissionResult] = useState<Submission | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImages(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmission = async () => {
    if (!selectedAssignment || images.length === 0 || !studentName) {
      alert("Missing name or files");
      return;
    }
    setIsSubmitting(true);
    try {
      const grading = await analyzeAnswer(selectedAssignment, images);
      const scores = grading.criteriasMet.map((met, idx) => met ? (selectedAssignment.markingPoints[idx]?.weight || 0) : 0);
      const newSub: Submission = {
        id: Date.now().toString(),
        assignmentId: selectedAssignment.id,
        studentName, studentAnswerImages: images,
        score: scores.reduce((a, b) => a + b, 0),
        maxScore: grading.totalPossible,
        feedback: grading.feedback,
        criteriaScores: scores,
        criteriasMet: grading.criteriasMet,
        gradedAt: Date.now()
      };
      onNewSubmission(newSub);
      setLastSubmissionResult(newSub);
      setSelectedAssignment(null);
      setImages([]);
      setStudentName('');
    } catch (err) {
      alert("Error during grading");
    } finally {
      setIsSubmitting(false);
    }
  };

  const { pending, completed } = useMemo(() => {
    const p: Assignment[] = [];
    const c: Assignment[] = [];
    assignments.forEach(a => {
      if (submissions.some(s => s.assignmentId === a.id)) c.push(a);
      else p.push(a);
    });
    return { pending: p, completed: c };
  }, [assignments, submissions]);

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {activeTab === 'tasks' && (
        <div className="space-y-8">
           <div>
              <h2 className="text-3xl font-black tracking-tight mb-2">My Current Tasks</h2>
              <p className="text-slate-500 font-medium">Finish your assignments to see AI feedback</p>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
             {pending.map(a => (
               <div key={a.id} className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 p-8 shadow-sm flex flex-col transition-all hover:shadow-xl hover:border-indigo-400 group">
                 <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-2xl mb-6">📝</div>
                 <h3 className="text-xl font-bold mb-3 group-hover:text-indigo-600 transition-colors">{a.title}</h3>
                 <p className="text-slate-500 text-sm mb-8 flex-1 leading-relaxed line-clamp-4">{a.question}</p>
                 <button onClick={() => setSelectedAssignment(a)} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-100 dark:shadow-none">
                   Start Submission
                 </button>
               </div>
             ))}
             {pending.length === 0 && (
               <div className="col-span-full py-20 bg-emerald-50/50 dark:bg-emerald-950/20 border-2 border-dashed border-emerald-100 dark:border-emerald-900 rounded-[2rem] text-center">
                 <p className="text-emerald-600 dark:text-emerald-400 font-black text-lg">All caught up! 🎉</p>
                 <p className="text-emerald-600/60 dark:text-emerald-400/60 font-bold">No pending assignments for now.</p>
               </div>
             )}
           </div>
        </div>
      )}

      {activeTab === 'my-grades' && (
        <div className="space-y-8">
          <h2 className="text-3xl font-black tracking-tight mb-2">Grading History</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {completed.map(a => {
              const sub = submissions.find(s => s.assignmentId === a.id);
              if (!sub) return null;
              return (
                <div key={a.id} className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-2xl font-black mb-1">{a.title}</h3>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Submitted {new Date(sub.gradedAt || 0).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black text-indigo-600">{sub.score} <span className="text-base opacity-40">/ {sub.maxScore}</span></p>
                    </div>
                  </div>
                  <div className="bg-indigo-50/50 dark:bg-indigo-950/30 p-6 rounded-3xl border border-indigo-100 dark:border-indigo-900/40 italic text-indigo-800 dark:text-indigo-300 font-medium mb-6">
                    "{sub.feedback}"
                  </div>
                  <div className="space-y-3">
                    {a.markingPoints.map((mp, i) => {
                      const met = sub.criteriaScores?.[i] === mp.weight;
                      return (
                        <div key={i} className="flex justify-between items-center text-sm px-2">
                           <span className="text-slate-500 font-bold">{mp.point}</span>
                           <span className={`font-black ${met ? 'text-emerald-500' : 'text-red-500'}`}>{sub.criteriaScores?.[i] || 0} / {mp.weight}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {completed.length === 0 && (
              <div className="col-span-full py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem] text-center">
                <p className="text-slate-400 font-bold">No results to show yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBMISSION MODAL */}
      {selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-6">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl overflow-y-auto max-h-[90vh] border border-white/10">
            <h3 className="text-3xl font-black mb-8">Ready to Submit?</h3>
            <div className="space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Your Full Name</label>
                <input className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 font-bold outline-none focus:ring-2 ring-indigo-500" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Enter name exactly as recorded..." />
              </div>
              
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Attach Your Solutions</label>
                <div className="flex flex-wrap gap-3">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                      {img.startsWith('data:application/pdf') ? <div className="w-full h-full bg-red-50 flex items-center justify-center font-bold text-red-500 text-[10px]">PDF</div> : <img src={img} className="w-full h-full object-cover" />}
                      <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-white/90 rounded-full w-5 h-5 text-[10px]">✕</button>
                    </div>
                  ))}
                  <label className="w-24 h-24 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors">
                    <input type="file" accept="image/*,application/pdf" onChange={handleImageChange} className="hidden" />
                    <span className="text-2xl text-slate-300">+</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-4 pt-8">
                <button onClick={() => { setSelectedAssignment(null); setImages([]); }} className="flex-1 py-4 font-bold text-slate-500 rounded-2xl">Cancel</button>
                <button disabled={isSubmitting || !studentName || images.length === 0} onClick={handleSubmission} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 dark:shadow-none disabled:opacity-50">
                  {isSubmitting ? 'AI Grading...' : 'Submit Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FINAL SCORE CELEBRATION MODAL */}
      {lastSubmissionResult && (
        <div className="fixed inset-0 bg-indigo-600/90 backdrop-blur-2xl flex items-center justify-center z-[250] p-6 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] w-full max-w-md p-12 shadow-2xl text-center">
            <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-950/40 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">🎉</div>
            <h3 className="text-3xl font-black mb-2">Well Done!</h3>
            <p className="text-slate-500 font-medium mb-8">Your work has been graded by SmartGrader AI.</p>
            <div className="p-8 bg-slate-50 dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-800 mb-8">
               <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Final Result</p>
               <p className="text-6xl font-black text-indigo-600">{lastSubmissionResult.score} <span className="text-2xl opacity-40">/ {lastSubmissionResult.maxScore}</span></p>
            </div>
            <button onClick={() => setLastSubmissionResult(null)} className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-bold hover:scale-[1.02] transition-transform">
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
