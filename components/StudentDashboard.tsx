
import React, { useState, useMemo, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Assignment, Submission } from '../types';
import { analyzeAnswer } from '../services/geminiService';
import { dbService } from '../services/dbService';

interface Props {
  studentId: string;
  adminId: string;
  classId: string;
}

const StudentDashboard: React.FC<Props> = ({ studentId, adminId, classId }) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [studentName, setStudentName] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmissionResult, setLastSubmissionResult] = useState<Submission | null>(null);
  const [expandedGradingHistory, setExpandedGradingHistory] = useState<Record<string, boolean>>({});

  // Fetch published assignments for this class
  useEffect(() => {
    const fetchData = async () => {
      if (classId && adminId) {
        const classAssignments = await dbService.getStudentAssignments(adminId, classId);
        setAssignments(classAssignments);

        // Fetch student's submissions
        const studentSubmissions = await dbService.getSubmissionsByStudent(adminId, studentId);
        setSubmissions(studentSubmissions);
      }
    };
    fetchData();
  }, [adminId, classId, studentId]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFiles(prev => [...prev, file]);
      const reader = new FileReader();
      reader.onloadend = () => setImageUrls(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmission = async () => {
    if (!selectedAssignment || imageFiles.length === 0 || !studentName) {
      alert("Missing name or files");
      return;
    }
    setIsSubmitting(true);
    try {
      // Upload images to Storage
      const uploadedImageUrls: string[] = [];
      for (const file of imageFiles) {
        const path = `submissions/${studentId}/${Date.now()}_${file.name}`;
        const url = await dbService.uploadImage(file, path);
        uploadedImageUrls.push(url);
      }

      // Grade using AI with base64 preview URLs
      const grading = await analyzeAnswer(selectedAssignment, imageUrls);
      const scores = grading.criteriasMet.map((met, idx) => met ? (selectedAssignment.markingPoints[idx]?.weight || 0) : 0);

      const isOverdue = selectedAssignment.dueDate && Date.now() > selectedAssignment.dueDate;
      const isLate = !!(isOverdue && !selectedAssignment.treatLateAsNormal);

      const newSub: Submission = {
        id: Date.now().toString(),
        assignmentId: selectedAssignment.id,
        studentId: studentId,
        studentName,
        studentAnswerImages: uploadedImageUrls, // Storage URLs
        studentAnswerImagesBase64: imageUrls, // Base64 for Gemini
        score: scores.reduce((a, b) => a + b, 0),
        maxScore: grading.totalPossible,
        feedback: grading.feedback,
        criteriaScores: scores,
        criteriasMet: grading.criteriasMet,
        annotations: grading.annotations, // Save annotations
        gradedAt: Date.now(),
        isLate
      };

      // Save to Firestore
      await dbService.saveSubmission(adminId, newSub);

      setSubmissions(prev => [newSub, ...prev]);
      setLastSubmissionResult(newSub);
      setSelectedAssignment(null);
      setImageFiles([]);
      setImageUrls([]);
      setStudentName('');
    } catch (err) {
      console.error(err);
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
    <div className="space-y-12 animate-in fade-in duration-500">
      <Routes>
        <Route path="/" element={
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-black tracking-tight mb-2">My Current Tasks</h2>
              <p className="text-slate-500 font-medium">Finish your assignments to see AI feedback</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {pending.map(a => {
                const isOverdue = a.dueDate && Date.now() > a.dueDate;
                const isClosed = isOverdue && !a.allowLateSubmissions && !a.treatLateAsNormal;
                const isLate = isOverdue && !a.treatLateAsNormal;

                // Simple Relative Time Logic (Refresh every render is okay for now, or use a hook for seconds)
                const getRelativeTime = (due: number) => {
                  const diff = due - Date.now();
                  const absDiff = Math.abs(diff);
                  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
                  const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
                  const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

                  let timeStr = "";
                  if (days > 0) timeStr += `${days}d `;
                  if (hours > 0) timeStr += `${hours}h `;
                  if (minutes > 0) timeStr += `${minutes}m `;
                  if (days === 0 && hours === 0) timeStr += `${seconds}s `; // Show seconds if close

                  if (diff > 0) return { text: `${timeStr}remaining`, color: 'text-emerald-600 dark:text-emerald-400' };
                  return { text: `${timeStr}late`, color: 'text-red-600 dark:text-red-400' };
                };

                const timeStatus = a.dueDate ? getRelativeTime(a.dueDate) : null;

                return (
                  <div key={a.id} className={`bg-white dark:bg-slate-800 rounded-[2rem] border ${isClosed ? 'border-red-200 dark:border-red-900/50 opacity-75' : 'border-slate-200 dark:border-slate-700'} p-8 shadow-sm flex flex-col transition-all hover:shadow-xl hover:border-indigo-400 group hover:-translate-y-1 relative overflow-hidden`}>
                    {isLate && !isClosed && <div className="absolute top-0 right-0 bg-orange-100 text-orange-600 px-4 py-1 rounded-bl-xl text-[10px] font-black uppercase tracking-widest">Late Submission</div>}
                    {isClosed && <div className="absolute top-0 right-0 bg-red-100 text-red-600 px-4 py-1 rounded-bl-xl text-[10px] font-black uppercase tracking-widest">Closed</div>}

                    <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-2xl mb-6 group-hover:scale-110 transition-transform">📝</div>
                    <h3 className="text-xl font-bold mb-1 group-hover:text-indigo-600 transition-colors line-clamp-1">{a.title}</h3>

                    {a.dueDate && (
                      <div className="mb-3 text-xs font-bold flex flex-wrap items-center justify-between gap-2">
                        <span className={`${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>Due: {new Date(a.dueDate).toLocaleString()}</span>
                        {timeStatus && (
                          <span className={`${timeStatus.color} uppercase tracking-wider text-[10px] bg-slate-50 dark:bg-slate-700/50 px-2 py-1 rounded`}>
                            {timeStatus.text}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-slate-500 text-sm mb-8 flex-1 leading-relaxed line-clamp-4">{a.question}</p>
                    <button
                      onClick={() => setSelectedAssignment(a)}
                      disabled={isClosed}
                      className={`w-full py-4 ${isClosed ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 dark:shadow-none active:scale-95'} font-bold rounded-2xl transition-all`}
                    >
                      {isClosed ? 'Submission Closed' : 'Start Submission'}
                    </button>
                  </div>
                )
              })}
              {pending.length === 0 && (
                <div className="col-span-full py-20 bg-emerald-50/50 dark:bg-emerald-950/20 border-2 border-dashed border-emerald-100 dark:border-emerald-900 rounded-[2rem] text-center animate-in zoom-in-95 duration-500">
                  <div className="text-5xl mb-4">🎉</div>
                  <p className="text-emerald-600 dark:text-emerald-400 font-black text-xl">All caught up!</p>
                  <p className="text-emerald-600/60 dark:text-emerald-400/60 font-bold">No pending assignments for now.</p>
                </div>
              )}
            </div>
          </div>
        } />

        <Route path="/grades" element={
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-3xl font-black tracking-tight mb-6">Grading History</h2>
            <div className="space-y-4">
              {completed.map(a => {
                const sub = submissions.find(s => s.assignmentId === a.id);
                if (!sub) return null;
                const isExpanded = expandedGradingHistory[a.id];

                return (
                  <div key={a.id} className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-all">
                    {/* Collapsed Header */}
                    <button
                      onClick={() => setExpandedGradingHistory(prev => ({ ...prev, [a.id]: !prev[a.id] }))}
                      className="w-full text-left p-6 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${sub.score >= (sub.maxScore * 0.8) ? 'bg-emerald-100 text-emerald-600' : sub.score >= (sub.maxScore * 0.5) ? 'bg-indigo-100 text-indigo-600' : 'bg-red-100 text-red-600'}`}>
                          {sub.score >= (sub.maxScore * 0.8) ? '🌟' : sub.score >= (sub.maxScore * 0.5) ? '👍' : '⚠️'}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-800 dark:text-white line-clamp-1">{a.title}</h3>
                          <div className="flex gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <span>{new Date(sub.gradedAt || 0).toLocaleDateString()}</span>
                            {a.dueDate && (
                              (() => {
                                const graded = sub.gradedAt || 0;
                                const diff = a.dueDate - graded;
                                if (diff < 0) return <span className="text-red-500">LATE</span>;
                                return <span className="text-emerald-500">EARLY</span>;
                              })()
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <span className="text-2xl font-black text-slate-800 dark:text-white">{sub.score}</span>
                          <span className="text-xs text-slate-400 font-bold"> / {sub.maxScore}</span>
                        </div>
                        <div className={`w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                          ⌄
                        </div>
                      </div>
                    </button>

                    {/* Detailed View */}
                    {isExpanded && (
                      <div className="p-8 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 animate-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {/* Image Preview */}
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Your Answer & AI Feedback</h4>
                            {sub.studentAnswerImages && sub.studentAnswerImages.length > 0 ? (
                              <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black relative inline-block w-full shadow-lg">
                                <div className="relative w-full h-auto">
                                  <img
                                    src={sub.studentAnswerImages[0]}
                                    alt="Your Answer"
                                    className="w-full h-auto max-h-[400px] object-contain mx-auto"
                                  />
                                  {/* AI Annotations */}
                                  {sub.annotations?.map((ann, i) => (
                                    <div
                                      key={i}
                                      className="absolute border-2 border-green-500 bg-green-500/20 rounded-lg flex items-center justify-center group pointer-events-none"
                                      style={{
                                        top: `${ann.box_2d[0] / 10}%`,
                                        left: `${ann.box_2d[1] / 10}%`,
                                        height: `${(ann.box_2d[2] - ann.box_2d[0]) / 10}%`,
                                        width: `${(ann.box_2d[3] - ann.box_2d[1]) / 10}%`,
                                      }}
                                    >
                                      <div className="absolute -top-8 left-0 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 transition-opacity pointer-events-none">
                                        {ann.label}
                                      </div>

                                      {ann.score !== undefined && (
                                        <div className="absolute -top-3 -right-3 w-6 h-6 bg-green-600 text-white text-xs font-black rounded-full flex items-center justify-center shadow-lg border border-white z-10">
                                          +{ann.score}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="bg-indigo-50/50 dark:bg-indigo-950/30 p-6 rounded-3xl border border-indigo-100 dark:border-indigo-900/40 italic text-indigo-800 dark:text-indigo-300 font-medium relative">
                                <div className="absolute -top-3 left-6 px-2 bg-white dark:bg-slate-800 text-[10px] font-black text-indigo-400 uppercase tracking-tighter">AI Feedback</div>
                                "{sub.feedback}"
                              </div>
                            )}
                          </div>

                          {/* Marking Criteria */}
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Marking Breakdown</h4>
                            <div className="space-y-3 bg-white dark:bg-slate-700/40 p-6 rounded-3xl border border-slate-100 dark:border-slate-700/60">
                              {a.markingPoints.map((mp, i) => {
                                const met = sub.criteriaScores?.[i] === mp.weight;
                                return (
                                  <div key={i} className="flex justify-between items-center text-sm p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-2 h-2 rounded-full ${met ? 'bg-emerald-500 shadow-lg shadow-emerald-200 dark:shadow-none' : 'bg-red-500'}`} />
                                      <span className={`font-bold ${met ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 line-through decoration-red-500'}`}>{mp.point}</span>
                                    </div>
                                    <span className={`font-black whitespace-nowrap bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg ${met ? 'text-emerald-600' : 'text-red-500'}`}>
                                      {sub.criteriaScores?.[i] || 0}/{mp.weight}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>


                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {completed.length === 0 && (
                <div className="col-span-full py-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[2rem] text-center opacity-50">
                  <div className="text-4xl mb-4">📉</div>
                  <p className="text-slate-400 font-bold">No results to show yet.</p>
                </div>
              )}
            </div>
          </div>
        } />

        <Route path="*" element={<Navigate to="/student" replace />} />
      </Routes>

      {/* SUBMISSION MODAL */}
      {selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-6 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl overflow-y-auto max-h-[90vh] border border-white/10 animate-in zoom-in-95 duration-300">
            <h3 className="text-3xl font-black mb-8">Ready to Submit?</h3>
            <div className="space-y-6">
              {/* Reference Images from Teacher */}
              {selectedAssignment.teacherAnswerImages && selectedAssignment.teacherAnswerImages.length > 0 && (
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Question Images</label>
                  <div className="flex flex-wrap gap-3">
                    {selectedAssignment.teacherAnswerImages.map((img, idx) => (
                      <div key={idx} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-indigo-200 dark:border-indigo-800 shadow-sm cursor-pointer hover:scale-105 transition-transform" onClick={() => window.open(img, '_blank')}>
                        <img src={img} className="w-full h-full object-cover" alt={`Question ${idx + 1}`} />
                        <div className="absolute inset-0 bg-indigo-600/0 hover:bg-indigo-600/10 transition-colors flex items-center justify-center">
                          <span className="text-white opacity-0 hover:opacity-100 text-xs">🔍</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 italic">Click on images to view full size</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Your Full Name</label>
                <input className="input-style" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Ex: Alex Johnson" />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Attach Your Solutions</label>
                <div className="flex flex-wrap gap-3">
                  {imageUrls.map((img, idx) => (
                    <div key={idx} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm animate-in zoom-in duration-200">
                      {img.startsWith('data:application/pdf') ? <div className="w-full h-full bg-red-50 dark:bg-red-950/20 flex items-center justify-center font-bold text-red-500 text-[10px]">PDF</div> : <img src={img} className="w-full h-full object-cover" />}
                      <button onClick={() => {
                        setImageFiles(imageFiles.filter((_, i) => i !== idx));
                        setImageUrls(imageUrls.filter((_, i) => i !== idx));
                      }} className="absolute top-1 right-1 bg-white/90 dark:bg-slate-700/90 rounded-full w-5 h-5 text-[10px] flex items-center justify-center shadow-sm">✕</button>
                    </div>
                  ))}
                  <label className="w-24 h-24 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-all hover:border-indigo-400 active:scale-95">
                    <input type="file" accept="image/*,application/pdf" onChange={handleImageChange} className="hidden" />
                    <span className="text-3xl text-slate-300 font-light">+</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-4 pt-8">
                <button onClick={() => { setSelectedAssignment(null); setImageFiles([]); setImageUrls([]); }} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors">Cancel</button>
                <button disabled={isSubmitting || !studentName || imageFiles.length === 0} onClick={handleSubmission} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 dark:shadow-none disabled:opacity-50 transition-all active:scale-95">
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
          <div className="bg-white dark:bg-slate-800 rounded-[3rem] w-full max-w-md p-12 shadow-2xl text-center animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-950/40 rounded-full flex items-center justify-center text-5xl mx-auto mb-6">🎉</div>
            <h3 className="text-3xl font-black mb-2 dark:text-white">Well Done!</h3>
            <p className="text-slate-500 font-medium mb-8">Your work has been graded by SmartGrader AI.</p>
            <div className="p-8 bg-slate-50 dark:bg-slate-700 rounded-3xl border border-slate-200 dark:border-slate-700 mb-8">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Final Result</p>
              <p className="text-7xl font-black text-indigo-600">{lastSubmissionResult.score} <span className="text-2xl opacity-40">/ {lastSubmissionResult.maxScore}</span></p>
            </div>
            <button onClick={() => setLastSubmissionResult(null)} className="w-full py-5 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl font-black hover:scale-[1.02] shadow-xl transition-all active:scale-95">
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
