
import React, { useState } from 'react';
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
      const newSub: Submission = {
        id: Date.now().toString(),
        assignmentId: selectedAssignment.id,
        studentName,
        studentAnswerImage: answerImage,
        score: grading.score,
        maxScore: grading.totalPossible,
        feedback: grading.feedback,
        gradedAt: Date.now()
      };
      onNewSubmission(newSub);
      alert(`Submission Successful! You scored ${grading.score} / ${grading.totalPossible}`);
      setSelectedAssignment(null);
      setAnswerImage(null);
      setStudentName('');
    } catch (err) {
      alert("Grading failed. Please check your API key and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Available Assignments</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {assignments.map(a => {
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
                  <div className="bg-indigo-50 dark:bg-indigo-950/20 p-4 rounded-xl border dark:border-indigo-900/30">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-indigo-800 dark:text-indigo-300 font-bold">Your Grade:</span>
                      <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{mySub.score} / {mySub.maxScore}</span>
                    </div>
                    <p className="text-sm text-indigo-700 dark:text-indigo-300 italic">" {mySub.feedback} "</p>
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
        })}
        {assignments.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
            <p className="text-slate-400 dark:text-slate-500">No assignments posted by the teacher yet.</p>
          </div>
        )}
      </div>

      {selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-8 shadow-2xl overflow-y-auto max-h-[90vh] border dark:border-slate-800">
            <h3 className="text-2xl font-bold mb-2 text-slate-800 dark:text-white">Submit for {selectedAssignment.title}</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">Upload a clear photo of your handwritten work.</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Your Name</label>
                <input 
                  className="w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-3 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  placeholder="Type your name here"
                />
              </div>
              
              <div className="p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-center bg-slate-50 dark:bg-slate-800/50">
                <input 
                  type="file" 
                  accept="image/*" 
                  id="student-answer" 
                  className="hidden" 
                  onChange={handleImageChange}
                />
                {!answerImage ? (
                  <label htmlFor="student-answer" className="cursor-pointer">
                    <div className="text-indigo-600 dark:text-indigo-400 font-bold mb-1">Click to upload photo</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-tight">Camera or Gallery</div>
                  </label>
                ) : (
                  <div className="relative group">
                    <img src={answerImage} className="max-h-48 mx-auto rounded-lg shadow-lg border dark:border-slate-700" alt="My work" />
                    <button 
                      onClick={() => setAnswerImage(null)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  disabled={isSubmitting}
                  onClick={() => setSelectedAssignment(null)}
                  className="flex-1 py-3 border dark:border-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  disabled={isSubmitting || !answerImage || !studentName}
                  onClick={handleSubmission}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Grading...
                    </>
                  ) : 'Submit Now'}
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
