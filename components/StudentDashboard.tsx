
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
  const [answerImage, setAnswerImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmissionResult, setLastSubmissionResult] = useState<Submission | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAnswerImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmission = async () => {
    if (!selectedAssignment || !answerImage || !studentName) {
      alert("Please fill in your name and upload an answer image.");
      return;
    }

    setIsSubmitting(true);
    try {
      const grading = await analyzeAnswer(selectedAssignment, answerImage);
      
      const initialScores = grading.criteriasMet.map((met, idx) => 
        met ? (selectedAssignment.markingPoints[idx]?.weight || 0) : 0
      );

      const newSub: Submission = {
        id: Date.now().toString(),
        assignmentId: selectedAssignment.id,
        studentName,
        studentAnswerImage: answerImage,
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
      setAnswerImage(null);
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
      if (submissions.some(s => s.assignmentId === a.id)) {
        completed.push(a);
      } else {
        pending.push(a);
      }
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
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">{a.title}</h3>
            {mySub ? (
              <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                Completed
              </span>
            ) : (
              <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                Pending
              </span>
            )}
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-6">{a.question}</p>
          {mySub && (
            <div className="space-y-4">
              <div className="bg-indigo-50 dark:bg-indigo-950/20 p-4 rounded-xl border dark:border-indigo-900/30">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-indigo-800 dark:text-indigo-300 font-bold">Your Grade:</span>
                  <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                    {mySub.score} / {mySub.maxScore}
                  </span>
                </div>
                <p className="text-sm text-indigo-700 dark:text-indigo-300 italic mb-4">" {mySub.feedback} "</p>
                
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
        {!mySub && (
          <button 
            onClick={() => setSelectedAssignment(a)}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors"
          >
            Submit Answer
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-12">
      {/* PENDING SECTION */}
      <section className="space-y-6">
        <h2 className="text-xl font-black text-slate-400 uppercase tracking-[0.2em]">Pending</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pendingAssignments.length > 0 ? (
            pendingAssignments.map(renderAssignmentCard)
          ) : (
            <div className="col-span-full py-12 text-center border-2 border-dashed dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
              <p className="text-slate-400">All caught up! No pending assignments.</p>
            </div>
          )}
        </div>
      </section>

      {/* COMPLETED SECTION */}
      <section className="space-y-6">
        <h2 className="text-xl font-black text-slate-400 uppercase tracking-[0.2em]">Completed</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {completedAssignments.length > 0 ? (
            completedAssignments.map(renderAssignmentCard)
          ) : (
            <div className="col-span-full py-12 text-center border-2 border-dashed dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
              <p className="text-slate-400">No completed assignments yet.</p>
            </div>
          )}
        </div>
      </section>

      {lastSubmissionResult && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-xl p-8 shadow-2xl border dark:border-slate-800 animate-in zoom-in duration-300">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-full mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-3xl font-black text-slate-800 dark:text-white">Graded!</h3>
              <div className="text-5xl font-black text-indigo-600 dark:text-indigo-400 my-4">
                <span className="whitespace-nowrap">{lastSubmissionResult.score} <span className="text-2xl text-slate-400">/ {lastSubmissionResult.maxScore}</span></span>
              </div>
            </div>
            <div className="space-y-4 mb-8">
              <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Marking Summary</h4>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border dark:border-slate-800 space-y-3">
                {assignments.find(a => a.id === lastSubmissionResult.assignmentId)?.markingPoints.map((mp, idx) => {
                  const score = lastSubmissionResult.criteriaScores?.[idx] ?? 0;
                  const isFull = score === mp.weight;
                  const isNone = score === 0;
                  return (
                    <div key={idx} className="flex justify-between items-start">
                      <div className="flex gap-3">
                        {isFull ? (
                          <svg className="w-5 h-5 text-green-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        ) : isNone ? (
                          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                        ) : (
                          <div className="w-5 h-5 bg-amber-400 rounded-full mt-0.5 flex items-center justify-center text-[10px] text-white font-bold shrink-0">!</div>
                        )}
                        <span className={`text-sm ${isNone ? 'text-red-500 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                          {mp.point}
                        </span>
                      </div>
                      <span className={`font-black text-sm whitespace-nowrap ${isFull ? 'text-green-600' : isNone ? 'text-red-600' : 'text-amber-600'}`}>
                        <span className="whitespace-nowrap">{score} / {mp.weight}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <button 
              onClick={() => setLastSubmissionResult(null)}
              className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-bold hover:opacity-90 transition-opacity"
            >
              Close & Continue
            </button>
          </div>
        </div>
      )}

      {selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-8 shadow-2xl overflow-y-auto max-h-[90vh] border dark:border-slate-800">
            <h3 className="text-2xl font-bold mb-2 text-slate-800 dark:text-white">Submit for {selectedAssignment.title}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Your Name</label>
                <input className="w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-3 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Type your name here" />
              </div>
              <div className="p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-center bg-slate-50 dark:bg-slate-800/50">
                <input type="file" accept="image/*" id="student-answer" className="hidden" onChange={handleImageChange} />
                {!answerImage ? (
                  <label htmlFor="student-answer" className="cursor-pointer block">
                    <div className="flex flex-col items-center">
                      <svg className="w-12 h-12 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <span className="font-bold text-indigo-600">Click to upload photo</span>
                    </div>
                  </label>
                ) : (
                  <div className="relative">
                    <img src={answerImage} className="max-h-48 mx-auto rounded-lg shadow-md" alt="My work" />
                    <button onClick={() => setAnswerImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center">×</button>
                  </div>
                )}
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setSelectedAssignment(null)} className="flex-1 py-3 border dark:border-slate-700 rounded-xl font-bold">Cancel</button>
                <button disabled={isSubmitting || !answerImage || !studentName} onClick={handleSubmission} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50">
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
