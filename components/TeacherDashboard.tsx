
import React, { useState, useMemo } from 'react';
import { Assignment, Submission, MarkingCriterion } from '../types';
import { extractMarkingPoints } from '../services/geminiService';

interface Props {
  activeTab: string;
  assignments: Assignment[];
  submissions: Submission[];
  onCreateAssignment: (a: Assignment) => void;
  onUpdateSubmission: (s: Submission) => void;
}

const TeacherDashboard: React.FC<Props> = ({ activeTab, assignments, submissions, onCreateAssignment, onUpdateSubmission }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [isEditingMarks, setIsEditingMarks] = useState(false);
  
  // Create Assignment State
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<MarkingCriterion[]>([]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImages(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const suggestMarkingPoints = async () => {
    if (images.length === 0) return;
    setLoading(true);
    try {
      const points = await extractMarkingPoints(images);
      setCriteria(points.map(p => ({ point: p, weight: 1 })));
    } catch (err) {
      alert("Could not extract points.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAssignment = () => {
    const newA: Assignment = {
      id: Date.now().toString(),
      title, question, teacherAnswerImages: images,
      markingPoints: criteria, createdAt: Date.now()
    };
    onCreateAssignment(newA);
    setShowAdd(false);
    setTitle(''); setQuestion(''); setImages([]); setCriteria([]);
  };

  const studentStats = useMemo(() => {
    const map = new Map();
    submissions.forEach(s => {
      if (!map.has(s.studentName)) map.set(s.studentName, { count: 0, total: 0, max: 0 });
      const stats = map.get(s.studentName);
      stats.count++;
      stats.total += s.score;
      stats.max += s.maxScore;
    });
    return Array.from(map.entries()).map(([name, stats]) => ({
      name,
      avg: stats.max > 0 ? ((stats.total / stats.max) * 100).toFixed(1) : "0.0",
      submissions: stats.count
    }));
  }, [submissions]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {activeTab === 'assignments' && (
        <div className="space-y-8">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Assignments</h2>
              <p className="text-slate-500 font-medium">Create and manage your grading templates</p>
            </div>
            <button onClick={() => setShowAdd(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-bold shadow-xl shadow-indigo-200 dark:shadow-none transition-all hover:-translate-y-1">
              + Create Template
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {assignments.map(a => (
              <div 
                key={a.id} 
                onClick={() => setSelectedAssignment(a)}
                className="group cursor-pointer bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-7 shadow-sm hover:shadow-xl hover:border-indigo-400 transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xl">📄</div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                    {a.markingPoints.length} Points
                  </span>
                </div>
                <h3 className="text-xl font-bold mb-2 group-hover:text-indigo-600 transition-colors">{a.title}</h3>
                <p className="text-slate-500 text-sm line-clamp-3 mb-6 leading-relaxed">{a.question}</p>
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">{new Date(a.createdAt).toLocaleDateString()}</span>
                  <div className="flex -space-x-2">
                    <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/40 rounded-full text-[10px] font-bold text-indigo-600 dark:text-indigo-400">View Details</div>
                  </div>
                </div>
              </div>
            ))}
            {assignments.length === 0 && (
              <div className="col-span-full py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem] text-center">
                <p className="text-slate-400 font-bold">No assignments yet. Click create to start!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'grades' && (
        <div className="space-y-6">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Gradebook</h2>
              <p className="text-slate-500 font-medium">Consolidated view of all student performance</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Student</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Assignment</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Result</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {submissions.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-8 py-5 font-bold text-slate-700 dark:text-slate-200">{s.studentName}</td>
                    <td className="px-8 py-5 text-slate-500">{assignments.find(a => a.id === s.assignmentId)?.title || 'Deleted'}</td>
                    <td className="px-8 py-5">
                      <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg font-black text-sm">
                        {s.score} / {s.maxScore}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button onClick={() => { setSelectedSubmission(s); setIsEditingMarks(false); }} className="text-sm font-bold text-indigo-600 hover:text-indigo-700">Open Details</button>
                    </td>
                  </tr>
                ))}
                {submissions.length === 0 && (
                  <tr><td colSpan={4} className="px-8 py-12 text-center text-slate-400 font-bold italic">No submissions yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'students' && (
        <div className="space-y-6">
           <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Student Roster</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
             {studentStats.map(stat => (
               <div key={stat.name} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                 <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full mb-4"></div>
                 <h3 className="font-black text-lg">{stat.name}</h3>
                 <div className="mt-4 flex justify-between items-center">
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Submissions</p>
                      <p className="text-xl font-black">{stat.submissions}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Avg Score</p>
                      <p className="text-xl font-black text-emerald-500">{stat.avg}%</p>
                    </div>
                 </div>
               </div>
             ))}
             {studentStats.length === 0 && (
               <div className="col-span-full py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem] text-center">
                 <p className="text-slate-400 font-bold">No students registered yet.</p>
               </div>
             )}
           </div>
        </div>
      )}

      {/* VIEW ASSIGNMENT MODAL */}
      {selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto p-10 shadow-2xl border border-white/10 relative">
            <button onClick={() => setSelectedAssignment(null)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600 text-xl font-black">✕</button>
            <div className="mb-10">
              <h3 className="text-3xl font-black tracking-tight mb-2">{selectedAssignment.title}</h3>
              <p className="text-slate-500 font-medium">Template Details & Marking Key</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4">Prompt Context</h4>
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedAssignment.question}
                  </div>
                </div>
                
                {selectedAssignment.teacherAnswerImages && selectedAssignment.teacherAnswerImages.length > 0 && (
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4">Reference Solution Files</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedAssignment.teacherAnswerImages.map((img, idx) => (
                        <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm aspect-video bg-slate-100 dark:bg-slate-800">
                           {img.startsWith('data:application/pdf') ? (
                             <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                               <span className="text-red-500 text-2xl">📄</span>
                               <span className="text-[10px] font-black text-slate-400">PDF PAGE {idx + 1}</span>
                             </div>
                           ) : (
                             <img src={img} className="w-full h-full object-cover" />
                           )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Marking Criteria</h4>
                <div className="bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-3xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  {selectedAssignment.markingPoints.map((mp, idx) => (
                    <div key={idx} className="p-5 flex justify-between items-center group">
                      <div className="flex gap-4 items-center">
                        <span className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-black">{idx + 1}</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{mp.point}</span>
                      </div>
                      <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg font-black text-xs whitespace-nowrap">
                        +{mp.weight}
                      </span>
                    </div>
                  ))}
                  <div className="p-5 bg-indigo-50/20 dark:bg-indigo-900/10 flex justify-between items-center">
                    <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Total Weight</span>
                    <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                      {selectedAssignment.markingPoints.reduce((sum, mp) => sum + mp.weight, 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE ASSIGNMENT MODAL */}
      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-10 shadow-2xl border border-white/10">
            <h3 className="text-3xl font-black mb-8">Create Assignment</h3>
            <div className="space-y-6">
              <div className="space-y-1">
                <label className="text-xs font-black uppercase text-slate-400 tracking-widest pl-1">Title</label>
                <input className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-slate-900 dark:text-white outline-none focus:ring-2 ring-indigo-500" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Physics Midterm - Unit 1" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-black uppercase text-slate-400 tracking-widest pl-1">Prompt / Question</label>
                <textarea className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-slate-900 dark:text-white outline-none h-32 focus:ring-2 ring-indigo-500" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Enter the question text for AI context..." />
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center"><label className="text-xs font-black uppercase text-slate-400 tracking-widest pl-1">Reference Answer Files</label></div>
                <div className="flex flex-wrap gap-3">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                      {img.startsWith('data:application/pdf') ? <div className="w-full h-full bg-red-50 flex items-center justify-center font-bold text-red-500 text-xs">PDF</div> : <img src={img} className="w-full h-full object-cover" />}
                      <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-white dark:bg-slate-800 rounded-full w-5 h-5 text-[10px] shadow-md">✕</button>
                    </div>
                  ))}
                  <label className="w-24 h-24 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors">
                    <input type="file" accept="image/*,application/pdf" onChange={handleImageChange} className="hidden" />
                    <span className="text-2xl text-slate-400">+</span>
                  </label>
                </div>
                {images.length > 0 && <button onClick={suggestMarkingPoints} disabled={loading} className="text-sm font-bold text-indigo-600 hover:text-indigo-700">{loading ? 'Working...' : '✨ Suggest marking points from file'}</button>}
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center"><label className="text-xs font-black uppercase text-slate-400 tracking-widest pl-1">Marking Rubric</label><button onClick={() => setCriteria([...criteria, { point: '', weight: 1 }])} className="text-xs font-bold text-indigo-600">+ Add Item</button></div>
                <div className="space-y-3">
                  {criteria.map((c, i) => (
                    <div key={i} className="flex gap-3 items-center">
                      <input className="flex-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm" value={c.point} onChange={e => { const n = [...criteria]; n[i].point = e.target.value; setCriteria(n); }} placeholder="Criteria description" />
                      <input type="number" step="0.5" className="w-20 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-bold" value={c.weight} onChange={e => { const n = [...criteria]; n[i].weight = parseFloat(e.target.value) || 0; setCriteria(n); }} />
                      <button onClick={() => setCriteria(criteria.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500 transition-colors">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-8 border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors">Discard</button>
                <button onClick={handleSubmitAssignment} disabled={!title || criteria.length === 0} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 dark:shadow-none disabled:opacity-50 disabled:shadow-none">Save Assignment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedSubmission && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl flex items-center justify-center z-[210] p-6">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] w-full max-w-6xl max-h-[90vh] overflow-y-auto p-12 shadow-2xl relative border border-white/5">
             <button onClick={() => setSelectedSubmission(null)} className="absolute top-10 right-10 text-slate-400 hover:text-slate-600 transition-colors text-2xl font-black">✕</button>
             <div className="flex items-center gap-6 mb-10">
               <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-3xl flex items-center justify-center text-white text-3xl">🎓</div>
               <div>
                 <h3 className="text-3xl font-black tracking-tight">{selectedSubmission.studentName}</h3>
                 <p className="text-slate-500 font-medium">Submission for {assignments.find(a => a.id === selectedSubmission.assignmentId)?.title}</p>
               </div>
               <div className="ml-auto text-center px-8 py-4 bg-indigo-50 dark:bg-indigo-950/40 rounded-3xl border border-indigo-100 dark:border-indigo-900/30">
                 <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Final Score</p>
                 <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400">{selectedSubmission.score} <span className="text-lg opacity-50">/ {selectedSubmission.maxScore}</span></p>
               </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
               <div className="space-y-6">
                 <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest pl-1">Student's Work</h4>
                 <div className="space-y-4">
                   {selectedSubmission.studentAnswerImages.map((img, i) => (
                     <div key={i} className="rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                       {img.startsWith('data:application/pdf') ? <div className="aspect-[3/4] bg-red-50 flex items-center justify-center font-bold text-red-500">Student PDF Page {i+1}</div> : <img src={img} className="w-full" />}
                     </div>
                   ))}
                 </div>
               </div>
               <div className="space-y-8">
                 <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest pl-1">AI Feedback</h4>
                    <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-3xl italic text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                      "{selectedSubmission.feedback}"
                    </div>
                 </div>
                 <div className="space-y-4">
                   <div className="flex justify-between items-center"><h4 className="text-xs font-black uppercase text-slate-400 tracking-widest pl-1">Points Breakdown</h4></div>
                   <div className="bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-3xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                     {assignments.find(a => a.id === selectedSubmission.assignmentId)?.markingPoints.map((mp, idx) => {
                       const val = selectedSubmission.criteriaScores?.[idx] ?? (selectedSubmission.criteriasMet?.[idx] ? mp.weight : 0);
                       const isCorrect = val === mp.weight;
                       return (
                         <div key={idx} className="p-6 flex justify-between items-center group">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 flex-1">{mp.point}</span>
                            <span className={`px-4 py-1.5 rounded-full text-xs font-black ${isCorrect ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                              {val} / {mp.weight}
                            </span>
                         </div>
                       );
                     })}
                   </div>
                 </div>
               </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
