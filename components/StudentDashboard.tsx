
import React, { useState, useMemo } from 'react';
import { Assignment, Submission } from '../types';
import { analyzeAnswer } from '../services/geminiService';

interface Props {
  assignments: Assignment[];
  submissions: Submission[];
  onNewSubmission: (s: Submission) => void;
}

const StudentDashboard: React.FC<Props> = ({ assignments, submissions, onNewSubmission }) => {
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [studentName, setStudentName] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmissionResult, setLastSubmissionResult] = useState<Submission | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmission = async () => {
    if (!selectedAssignment || images.length === 0 || !studentName) {
      alert("Please fill in your name and upload at least one answer file.");
      return;
    }

    setIsSubmitting(true);
    try {
      const grading = await analyzeAnswer(selectedAssignment, images);
      
      const initialScores = grading.criteriasMet.map((met, idx) => 
        met ? (selectedAssignment.markingPoints[idx]?.weight || 0) : 0
      );

      const newSub: Submission = {
        id: Date.now().toString(),
        assignmentId: selectedAssignment.id,
        studentName,
        studentAnswerImages: images,
        score: initialScores.reduce((a, b) => a + b, 0),
        maxScore: grading.totalPossible,
        feedback: grading.feedback,
        criteriaScores: initialScores,
        criteriasMet: grading.criteriasMet,
        gradedAt: Date.now()
      };
      onNewSubmission(newSub);
      setLastSubmissionResult(newSub);
      setSelectedAssignment(null);
      setImages([]);
      setStudentName('');
    } catch (err) {
      console.error(err);
      alert("Grading failed. Please check your API key and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const { pendingAssignments, completedAssignments } = useMemo(() => {
    const sorted = [...assignments].sort((a, b) => b.createdAt - a.createdAt);
    const pending: Assignment[] = [];
    const completed: Assignment[] = [];
    sorted.forEach(a => {
      if (submissions.some(s => s.assignmentId === a.id)) completed.push(a);
      else pending.push(a);
    });
    return { pendingAssignments: pending, completedAssignments: completed };
  }, [assignments, submissions]);

  const renderBreakdownItem = (point: string, score: number, max: number, idx: number) => {
    const isFull = score === max;
    const isNone = score === 0;
    return (
      <div key={idx} className="flex justify-between items-start text-sm">
        <span className={isNone ? "text-red-500 font-medium" : "text-slate-600 dark:text-slate-400"}>
          {point}
        </span>
        <span className={`font-bold ml-4 whitespace-nowrap ${isFull ? 'text-green-600 dark:text-green-400' : isNone ? 'text-red-600' : 'text-amber-600'}`}>
          <span className="whitespace-nowrap">{score} / {max}</span>
        </span>
      </div>
    );
  };

  const renderAssignmentCard = (a: Assignment) => {
    const mySub = submissions.find(s => s.assignmentId === a.id);
    return (
      <div key={a.id} className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-all hover:shadow-md">
        <div className="p-6 flex-1">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xl font-bold">{a.title}</h3>
            {mySub ? (
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Completed</span>
            ) : (
              <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Pending</span>
            )}
          </div>
          <p className="text-slate-600 text-sm mb-6">{a.question}</p>
          {mySub && (
            <div className="space-y-4">
              <div className="bg-indigo-50 dark:bg-indigo-950/20 p-4 rounded-xl border dark:border-indigo-900/30">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-indigo-800 dark:text-indigo-300">Your Grade:</span>
                  <span className="text-2xl font-black text-indigo-600 whitespace-nowrap">{mySub.score} / {mySub.maxScore}</span>
                </div>
                <p className="text-sm italic text-indigo-700 mb-4">"{mySub.feedback}"</p>
                
                <div className="border-t dark:border-indigo-900/50 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3">Breakdown</h4>
                  <div className="space-y-2">
                    {a.markingPoints.map((mp, idx) => 
                      renderBreakdownItem(mp.point, mySub.criteriaScores?.[idx] ?? 0, mp.weight, idx)
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        {!mySub && <button onClick={() => setSelectedAssignment(a)} className="w-full py-4 bg-indigo-600 text-white font-bold transition-colors">Submit Answer</button>}
      </div>
    );
  };

  return (
    <div className="space-y-12">
      <section className="space-y-6">
        <h2 className="text-xl font-black text-slate-400 uppercase tracking-widest">Pending</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pendingAssignments.length > 0 ? pendingAssignments.map(renderAssignmentCard) : <div className="col-span-full py-12 text-center text-slate-400 italic">No pending tasks.</div>}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-black text-slate-400 uppercase tracking-widest">Completed</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {completedAssignments.length > 0 ? completedAssignments.map(renderAssignmentCard) : <div className="col-span-full py-12 text-center text-slate-400 italic">No submissions yet.</div>}
        </div>
      </section>

      {lastSubmissionResult && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-xl p-8 shadow-2xl animate-in zoom-in">
            <div className="text-center mb-8">
              <h3 className="text-3xl font-black">Graded!</h3>
              <div className="text-5xl font-black text-indigo-600 my-4">{lastSubmissionResult.score} / {lastSubmissionResult.maxScore}</div>
            </div>
            <div className="space-y-4 mb-8">
              <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Marking Summary</h4>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border dark:border-slate-800 space-y-3">
                {assignments.find(as => as.id === lastSubmissionResult.assignmentId)?.markingPoints.map((mp, idx) => {
                  const score = lastSubmissionResult.criteriaScores?.[idx] ?? 0;
                  const isFull = score === mp.weight;
                  const isNone = score === 0;
                  return (
                    <div key={idx} className="flex justify-between items-start">
                      <div className="flex gap-3">
                        <span className={`text-sm ${isNone ? 'text-red-500 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                          {mp.point}
                        </span>
                      </div>
                      <span className={`font-black text-sm whitespace-nowrap ${isFull ? 'text-green-600' : isNone ? 'text-red-600' : 'text-amber-600'}`}>
                        {score} / {mp.weight}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <button onClick={() => setLastSubmissionResult(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold">Close & Continue</button>
          </div>
        </div>
      )}

      {selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-8 shadow-2xl overflow-y-auto max-h-[90vh] border dark:border-slate-800">
            <h3 className="text-2xl font-bold mb-6">Submit for {selectedAssignment.title}</h3>
            <div className="space-y-4">
              <input className="w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-3 outline-none" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Your Name" />
              
              <div>
                <label className="block text-sm font-medium mb-1">Your Answer Files (In Order)</label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group w-24 h-24">
                      {img.startsWith('data:application/pdf') ? (
                        <div className="w-full h-full flex items-center justify-center bg-red-100 rounded border border-red-200">
                          <span className="text-red-700 font-bold text-xs">PDF</span>
                        </div>
                      ) : (
                        <img src={img} className="w-full h-full object-cover rounded border border-slate-200" alt={`Page ${idx+1}`} />
                      )}
                      <button onClick={() => removeImage(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center shadow-lg">×</button>
                      <span className="absolute bottom-0 right-0 bg-black/50 text-white text-[10px] px-1 rounded-tl">{idx+1}</span>
                    </div>
                  ))}
                  <label className="w-24 h-24 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors">
                    <input type="file" accept="image/*,application/pdf" onChange={handleImageChange} className="hidden" />
                    <span className="text-xl text-slate-400">+</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => { setSelectedAssignment(null); setImages([]); }} className="flex-1 py-3 font-bold text-slate-500">Cancel</button>
                <button disabled={isSubmitting || images.length === 0 || !studentName} onClick={handleSubmission} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50">
                  {isSubmitting ? 'Grading...' : 'Submit Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
