
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { extractActivitiesFromTextbook, gradeLearningActivity } from '../services/continuousLearningService';
import { Textbook, LearningActivity, ActivitySubmission } from '../types';
import { WebcamScanner } from './WebcamScanner';

interface Props {
  studentId: string;
  adminId: string;
}

const ContinuousLearning: React.FC<Props> = ({ studentId, adminId }) => {
  const [view, setView] = useState<'LIBRARY' | 'ACTIVITIES' | 'SOLVE_MODE'>('LIBRARY');
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [selectedTextbook, setSelectedTextbook] = useState<Textbook | null>(null);
  const [activities, setActivities] = useState<LearningActivity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<LearningActivity | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTextbookScanner, setShowTextbookScanner] = useState(false);

  // Solve Mode State
  const [showWebcam, setShowWebcam] = useState(false);
  const [answerImages, setAnswerImages] = useState<string[]>([]);
  const [isGrading, setIsGrading] = useState(false);
  const [gradingResult, setGradingResult] = useState<ActivitySubmission | null>(null);

  const [submissions, setSubmissions] = useState<ActivitySubmission[]>([]);

  useEffect(() => {
    loadTextbooks();
  }, [studentId, adminId]);

  // Load submissions globally to show progress
  useEffect(() => {
    const loadSubs = async () => {
      try {
        const subs = await dbService.getActivitySubmissions(adminId, studentId);
        setSubmissions(subs);
      } catch (err: any) {
        console.error("Failed to load submissions", err);
        if (err.message && err.message.includes('index')) {
          alert("Admin Action Required: The 'submissions' query requires a Firestore Index. Please check the browser console for the creation link.");
        }
      }
    };
    loadSubs();
  }, [studentId, adminId]);

  const loadTextbooks = async () => {
    const data = await dbService.getTextbooks(adminId, studentId);
    setTextbooks(data);
  };

  const loadActivities = async (book: Textbook) => {
    setIsProcessing(true);
    // Updated: Pass studentId
    const acts = await dbService.getActivitiesForTextbook(adminId, book.studentId, book.id);

    // Sort activities by extracted number (Section/Exercise number)
    const sortedActs = acts.sort((a, b) => {
      const getNum = (s?: string) => {
        if (!s) return Infinity;
        const match = s.match(/(\d+)(\.\d+)?/);
        return match ? parseFloat(match[0]) : Infinity;
      };

      const numA = getNum(a.title);
      const numB = getNum(b.title);

      if (numA !== numB && numA !== Infinity && numB !== Infinity) {
        return numA - numB;
      }

      // Fallback to string sort
      const titleA = a.title || '';
      const titleB = b.title || '';
      return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
    });

    setActivities(sortedActs);
    setIsProcessing(false);
  };

  const deleteTextbook = async (textbook: Textbook) => {
    if (!confirm('Are you sure you want to delete this textbook?')) return;
    try {
      // Updated: Pass studentId
      await dbService.deleteTextbook(adminId, textbook.studentId, textbook.id);
      setTextbooks(prev => prev.filter(t => t.id !== textbook.id));
    } catch (err) {
      console.error(err);
      alert("Failed to delete textbook");
    }
  };

  const handleTextbookUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // 1. Upload File
      const path = `textbooks/${studentId}/${Date.now()}_${file.name}`;
      const url = await dbService.uploadImage(file, path);

      // 2. Create Textbook Record
      const newBook: Textbook = {
        id: Date.now().toString(),
        studentId,
        title: file.name.replace('.pdf', ''),
        subjectId: 'generic', // Could be prompted
        fileUrl: url,
        uploadedAt: Date.now(),
        status: 'PROCESSING'
      };
      await dbService.saveTextbook(adminId, newBook);

      // 3. Trigger Extraction (Client-side for now, ideally backend function)
      // Convert to base64 for Gemini
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          const extractedActs = await extractActivitiesFromTextbook(base64, newBook.id);
          // Updated: Pass studentId (newBook.studentId is same as scope studentId)
          await dbService.saveExtractedActivities(adminId, newBook.studentId, extractedActs);

          // Update local state
          newBook.status = 'READY';
          newBook.totalActivities = extractedActs.length;
          await dbService.saveTextbook(adminId, newBook);
          setTextbooks(prev => [newBook, ...prev]);
          alert(`Success! Extracted ${extractedActs.length} activities.`);
        } catch (err) {
          console.error("Extraction failed", err);
          newBook.status = 'ERROR';
          await dbService.saveTextbook(adminId, newBook);
          alert("Failed to extract activities. Pleas try a shorter PDF. Error: " + (err as Error).message);
        }
      };
      reader.readAsDataURL(file);

    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleTextbookCapture = async (imgSrc: string) => {
    // Keep scanner open for multiple pages
    // setShowTextbookScanner(false); 
    setIsUploading(true);
    try {
      // 1. Upload Image
      const res = await fetch(imgSrc);
      const blob = await res.blob();
      const file = new File([blob], `scanned_textbook_${Date.now()}.jpg`, { type: 'image/jpeg' });

      const path = `textbooks/${studentId}/${Date.now()}_scanned.jpg`;
      const url = await dbService.uploadImage(file, path);

      // 2. Create Textbook Record
      const newBook: Textbook = {
        id: Date.now().toString(),
        studentId,
        title: `Scanned Page ${new Date().toLocaleTimeString()}`,
        subjectId: 'generic',
        fileUrl: url,
        uploadedAt: Date.now(),
        status: 'PROCESSING'
      };
      await dbService.saveTextbook(adminId, newBook);

      // 3. Trigger Extraction
      // imgSrc is already base64
      const extractedActs = await extractActivitiesFromTextbook(imgSrc, newBook.id);
      await dbService.saveExtractedActivities(adminId, newBook.studentId, extractedActs);

      // Update local state
      newBook.status = 'READY';
      newBook.totalActivities = extractedActs.length;
      await dbService.saveTextbook(adminId, newBook);
      setTextbooks(prev => [newBook, ...prev]);
      alert(`Success! Extracted ${extractedActs.length} activities.`);

    } catch (err) {
      console.error("Scanning failed", err);
      // Create error backend record if needed, or just alert
      alert("Failed to process scanned page: " + (err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCapture = (imgSrc: string) => {
    setAnswerImages(prev => [...prev, imgSrc]);
    // Keep scanner open
    // setShowWebcam(false);
  };

  const submitAnswer = async () => {
    if (!selectedActivity || answerImages.length === 0) return;
    setIsGrading(true); // Using isGrading as loading state for submission
    try {
      // 1. Upload Images
      const uploadedUrls: string[] = [];
      for (const base64 of answerImages) {
        // Convert base64 to File object for upload
        const res = await fetch(base64);
        const blob = await res.blob();
        const file = new File([blob], `answer_${Date.now()}.jpg`, { type: 'image/jpeg' });

        const path = `activity_submissions/${studentId}/${Date.now()}_${selectedActivity.id}`;
        const url = await dbService.uploadImage(file, path);
        uploadedUrls.push(url);
      }

      // 2. Save Submission (No Grading)
      const submission: ActivitySubmission = {
        id: Date.now().toString(),
        activityId: selectedActivity.id,
        textbookId: selectedTextbook?.id,
        studentId,
        answerImageUrls: uploadedUrls,
        submittedAt: Date.now(),
        attempts: 1,
        status: 'SUBMITTED'
      };

      await dbService.saveActivitySubmission(adminId, submission);
      setSubmissions(prev => [submission, ...prev]);
      setGradingResult(submission); // Re-using this state to trigger success view
    } catch (err) {
      console.error(err);
      alert("Submission failed: " + (err as Error).message);
    } finally {
      setIsGrading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tight mb-2">Continuous Learning</h2>
          <p className="text-slate-500 font-medium">Practice with your own textbooks and getting instant feedback.</p>
        </div>
        {view !== 'LIBRARY' && (
          <button onClick={() => { setView('LIBRARY'); setSelectedTextbook(null); }} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors">
            Back to Library
          </button>
        )}
      </div>

      {/* VIEW: LIBRARY */}
      {view === 'LIBRARY' && (
        <div className="space-y-8">
          {/* Upload Area */}
          <div className="p-8 border-2 border-dashed border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-[2rem] text-center transition-all hover:border-indigo-400">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 text-indigo-600">📚</div>
            <h3 className="text-xl font-bold mb-2 text-indigo-900 dark:text-indigo-200">Upload a Textbook</h3>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">Upload a PDF chapter or worksheet. AI will automatically extract exercises for you to practice.</p>
            <div className="flex gap-4 justify-center">
              <label className={`inline-flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer transition-transform active:scale-95 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {isUploading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <span>📤</span>}
                <span>{isUploading ? 'Processing File...' : 'Upload PDF'}</span>
                <input type="file" accept="application/pdf" className="hidden" onChange={handleTextbookUpload} />
              </label>

              <button
                onClick={() => setShowTextbookScanner(true)}
                disabled={isUploading}
                className="inline-flex items-center gap-2 px-8 py-3 bg-white dark:bg-slate-800 text-indigo-600 border-2 border-indigo-200 dark:border-indigo-900 hover:border-indigo-500 rounded-xl font-bold cursor-pointer transition-colors active:scale-95 disabled:opacity-50"
              >
                <span>📸</span>
                <span>Scan Page</span>
              </button>
            </div>
          </div>

          {/* Book List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {textbooks.map(book => {
              // Calculate Progress
              // Fallback: If totalActivities is missing (old data), we might show 0 or handle fetching, but here we assume new/migrated data.
              // We need submissions to calculate progress. We have 'submissions' state but it's loaded only when a book is selected logic used to be there.
              // Update: We should fetch ALL submissions on mount to show progress here. 
              // Assuming 'submissions' contains ALL for student (as per dbService.getActivitySubmissions).

              const total = book.totalActivities || 0;
              // Count unique activities submitted for THIS book.
              // Note: 'submissions' state might need to be guaranteed loaded. Currently it's loaded in useEffect dependent on 'selectedTextbook'.
              // We need to verify 'submissions' are loaded globally for the library view.

              // However, if we assume 'submissions' has the list, we can filter.
              // But ActivitySubmission didn't have textbookId before this change.
              // For backward compatibility or accurate counting without textbookId, we'd need to join. :-(
              // But let's assume we proceed with the new field.

              const bookSubmissions = submissions.filter(s => s.textbookId === book.id);
              // Filter distinct activities
              const completedCount = new Set(bookSubmissions.map(s => s.activityId)).size;
              const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;

              return (
                <div key={book.id} onClick={() => {
                  if (book.status === 'READY') {
                    setSelectedTextbook(book);
                    loadActivities(book);
                    setView('ACTIVITIES');
                  }
                }} className={`group relative bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all ${book.status !== 'READY' ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1'}`}>
                  <div className="absolute top-4 right-4">
                    {book.status === 'PROCESSING' && <span className="bg-yellow-100 text-yellow-700 text-[10px] font-black uppercase px-2 py-1 rounded">Processing</span>}
                    {book.status === 'READY' && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase px-2 py-1 rounded">Ready</span>}
                    {book.status === 'ERROR' && <span className="bg-red-100 text-red-700 text-[10px] font-black uppercase px-2 py-1 rounded">Error</span>}
                  </div>

                  <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTextbook(book); }}
                      className="p-2 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors"
                      title="Delete Textbook"
                    >
                      🗑️
                    </button>
                  </div>

                  <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">📖</div>
                  <h4 className="font-bold text-lg mb-1 line-clamp-1">{book.title}</h4>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4">{new Date(book.uploadedAt).toLocaleDateString()}</p>

                  {/* Progress Bar */}
                  {book.status === 'READY' && (
                    <div>
                      <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                        <span>Progress</span>
                        <span>{completedCount}/{total} ({progress}%)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW: ACTIVITIES LIST */}
      {view === 'ACTIVITIES' && selectedTextbook && (
        <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
          <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <h3 className="text-2xl font-black relative z-10">{selectedTextbook.title}</h3>
            <p className="text-slate-400 font-medium relative z-10">{activities.length} Activities Found</p>
          </div>

          {isProcessing ? (
            <div className="py-20 text-center">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500 font-bold">Loading Activities...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {activities.map(act => {
                const submission = submissions.find(s => s.activityId === act.id);
                const isSubmitted = !!submission;

                return (
                  <div key={act.id} className={`bg-white dark:bg-slate-800 p-6 rounded-3xl border ${isSubmitted ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/20' : 'border-slate-200 dark:border-slate-700'} flex items-center gap-6 hover:border-indigo-400 transition-colors group`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${isSubmitted ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600'}`}>
                      {isSubmitted ? '✓' : (act.type === 'QA' ? '?' : act.type === 'MCQ' ? '☑' : '✍')}
                    </div>
                    <div className="flex-1">
                      <div className="flex gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-500">{act.type}</span>
                        {act.difficulty && <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${act.difficulty === 'hard' ? 'bg-red-100 text-red-600' : act.difficulty === 'medium' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>{act.difficulty}</span>}
                        {isSubmitted && <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded">Submitted</span>}
                      </div>
                      {act.title && <h5 className="font-black text-sm text-indigo-600 mb-1">{act.title}</h5>}
                      <p className="font-bold text-slate-700 dark:text-slate-200 line-clamp-2">{act.question}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (isSubmitted) {
                          // View submission? For now just re-open or show saved state logic could be added
                          // Alerting for simplicity or we could allow re-submit
                          setGradingResult(submission);
                        } else {
                          setGradingResult(null);
                          setAnswerImages([]);
                        }
                        setSelectedActivity(act);
                        setView('SOLVE_MODE');
                      }}
                      className={`px-6 py-3 rounded-xl font-black transition-colors shadow-lg dark:shadow-none translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 ${isSubmitted ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 shadow-emerald-100' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}`}
                    >
                      {isSubmitted ? 'View' : 'Start'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW: SOLVE MODE */}
      {view === 'SOLVE_MODE' && selectedActivity && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in zoom-in-95 duration-300">
          {/* Question Panel */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-700">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 block">Question</span>
              <h3 className="text-2xl font-bold leading-relaxed">{selectedActivity.question}</h3>
              {selectedActivity.topic && <div className="mt-6 inline-block bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 px-4 py-2 rounded-xl font-bold text-sm">Target: {selectedActivity.topic}</div>}
            </div>

            {/* Answer Upload / Camera */}
            {gradingResult ? (
              <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center py-12">
                <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-2xl mb-4 text-slate-500">🔒</div>
                <h4 className="text-xl font-black text-slate-700 dark:text-slate-200 mb-2">Submission Viewer</h4>
                <p className="font-medium text-slate-500 mb-8 max-w-xs">You are viewing a submitted answer. You can submit a new attempt if you wish.</p>

                <button
                  onClick={() => {
                    setGradingResult(null);
                    setAnswerImages([]);
                  }}
                  className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all shadow-xl shadow-indigo-200 dark:shadow-none active:scale-95 flex items-center gap-2"
                >
                  <span>↺</span>
                  <span>Re-Submit New Answer</span>
                </button>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-6">Previous submissions are kept in history</p>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-700">
                <div className="flex flex-wrap gap-4 mb-6">
                  {answerImages.map((img, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-slate-300 shadow-sm">
                      <img src={img} className="w-full h-full object-cover" />
                      <button onClick={() => setAnswerImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-black">×</button>
                    </div>
                  ))}
                  <button onClick={() => setShowWebcam(true)} className="w-24 h-24 rounded-2xl bg-white dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center gap-1 hover:border-indigo-500 transition-colors text-slate-400 hover:text-indigo-500">
                    <span className="text-2xl">📸</span>
                    <span className="text-[10px] font-black uppercase">Scan</span>
                  </button>
                </div>

                <button
                  onClick={submitAnswer}
                  disabled={answerImages.length === 0 || isGrading}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-200 dark:shadow-none transition-all active:scale-95 flex items-center justify-center gap-3">
                  {isGrading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : 'Submit Answer'}
                </button>
              </div>
            )}
          </div>

          {/* Result Panel */}
          <div className="relative flex flex-col gap-6">
            {gradingResult ? (
              <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-xl border border-indigo-100 dark:border-indigo-900 animate-in slide-in-from-bottom-8 duration-500">
                <div className="w-20 h-20 rounded-[2rem] flex items-center justify-center text-4xl mb-6 bg-emerald-100 text-emerald-600">
                  ✅
                </div>
                <h3 className="text-3xl font-black mb-2">Submitted!</h3>
                <p className="text-slate-500 font-bold mb-6">Your answer has been saved for teacher review.</p>

                {gradingResult.answerImageUrls && gradingResult.answerImageUrls.length > 0 && (
                  <div className="mb-6">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Your Answer</p>
                    <div className="flex flex-wrap gap-2">
                      {gradingResult.answerImageUrls.map((url, idx) => (
                        <div key={idx} className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                          <img src={url} className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" onClick={() => window.open(url, '_blank')} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-3xl mb-8 leading-relaxed text-slate-600 dark:text-slate-300">
                  You can continue with other exercises while waiting for feedback.
                </div>

                <button onClick={() => { setView('ACTIVITIES'); setGradingResult(null); setAnswerImages([]); }} className="w-full py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl font-bold">
                  Back to Exercises
                </button>
              </div>
            ) : (
              <div className="h-full bg-slate-100 dark:bg-slate-800/30 rounded-[2.5rem] flex items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 dark:border-slate-700/50 opacity-50 min-h-[300px]">
                <div>
                  <div className="text-4xl mb-4">🏆</div>
                  <p className="font-bold text-slate-400">Submit your answer to save it for review.</p>
                </div>
              </div>
            )}

            {/* Submission History */}
            {(() => {
              const history = submissions.filter(s => s.activityId === selectedActivity.id).sort((a, b) => b.submittedAt - a.submittedAt);
              if (history.length === 0) return null;

              return (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-700 animate-in slide-in-from-bottom-4 duration-500 delay-100">
                  <h4 className="text-lg font-black mb-4">Submission History ({history.length})</h4>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                    {history.map((sub, i) => (
                      <div
                        key={sub.id}
                        onClick={() => setGradingResult(sub)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4 ${gradingResult?.id === sub.id ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'border-slate-100 hover:border-indigo-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'}`}
                      >
                        <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-lg shadow-sm">
                          {history.length - i}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{new Date(sub.submittedAt).toLocaleString()}</p>
                          <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                            {sub.status === 'GRADED' ? `Graded: ${sub.score}/10` : 'Submitted'}
                          </p>
                        </div>
                        {gradingResult?.id === sub.id && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* WEBCAM MODAL (ANSWER) */}
      {showWebcam && (
        <div className="fixed inset-0 z-[100] bg-black">
          <WebcamScanner
            isActive={true}
            onCapture={handleCapture}
            onClose={() => setShowWebcam(false)}
          />
        </div>
      )}

      {/* WEBCAM MODAL (TEXTBOOK) */}
      {showTextbookScanner && (
        <div className="fixed inset-0 z-[100] bg-black">
          <WebcamScanner
            isActive={true}
            onCapture={handleTextbookCapture}
            onClose={() => setShowTextbookScanner(false)}
          />
        </div>
      )}

    </div>
  );
};

export default ContinuousLearning;
