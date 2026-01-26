
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Assignment, Submission, MarkingCriterion, Teacher, Student, Subject, Class, NoteCorrection, GeneratedNote, Annotation } from '../types';
import { BookOpen, GraduationCap, Users, FileText, CheckCircle, Clock, ChevronRight, ChevronDown, Search, Filter, MoreVertical, Download, X, Image as ImageIcon, Crop as CropIcon, Camera } from 'lucide-react';
import { dbService } from '../services/dbService';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '../utils/cropImage';
import { uploadBase64ToStorage } from '../services/pdfExtractor';
import { extractMarkingPoints, analyzeTeachingNote, NoteSectionDraft, NoteAnalysisResult, createEnhancedNote, extractCorrectionSummary, applyNoteCorrection, extractModuleTitle } from '../services/geminiService';
import { extractPDFContent, ExtractedImage } from '../services/pdfExtractor';
import { WebcamScanner } from './WebcamScanner';
import mermaid from 'mermaid';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { identifyStudentName, analyzeAnswer } from '../services/geminiService';
import { compressImage } from '../utils/imageUtils';

const TeacherDashboard: React.FC<{ teacherId: string, adminId: string }> = ({ teacherId, adminId }) => {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]); // TODO: Fetch from DB
  const [showAdd, setShowAdd] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [draftEdit, setDraftEdit] = useState<Assignment | null>(null);
  const [draftImageFiles, setDraftImageFiles] = useState<File[]>([]);
  const [draftImagePreviews, setDraftImagePreviews] = useState<string[]>([]);

  // Create Assignment State
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  // New States for Due Date
  const [dueDate, setDueDate] = useState<string>(''); // ISO String from input
  const [allowLate, setAllowLate] = useState<boolean>(true);
  const [criteria, setCriteria] = useState<MarkingCriterion[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');

  // Display Names Map
  const [classNames, setClassNames] = useState<{ [key: string]: string }>({});
  const [subjectNames, setSubjectNames] = useState<{ [key: string]: string }>({});
  const [classData, setClassData] = useState<{ [key: string]: Class }>({});

  // Toast Notification
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };


  // Load Teacher Profile & Names
  useEffect(() => {
    const fetchProfileAndNames = async () => {
      const allTeachers = await dbService.getTeachers(adminId);
      const profile = allTeachers.find(t => t.id === teacherId);
      if (profile) {
        setTeacher(profile);

        // Fetch Names
        const cNames: { [key: string]: string } = {};
        const sNames: { [key: string]: string } = {};
        const cData: { [key: string]: Class } = {};

        // 1. My Class Name
        if (profile.assignedClassId) {
          const c = await dbService.getClass(adminId, profile.assignedClassId);
          if (c) {
            cNames[profile.assignedClassId] = c.name;
            cData[profile.assignedClassId] = c;
          }
        }

        // 2. Assigned Subjects Classes & Subject Names
        for (const assign of profile.assignedSubjects) {
          if (!cNames[assign.classId]) {
            const c = await dbService.getClass(adminId, assign.classId);
            if (c) {
              cNames[assign.classId] = c.name;
              cData[assign.classId] = c;
            }
          }
          if (!sNames[assign.subjectId]) {
            const s = await dbService.getSubject(adminId, assign.subjectId);
            // If subject found, use name. Else assume legacy ID-as-name or just show ID
            if (s) sNames[assign.subjectId] = s.name;
            else sNames[assign.subjectId] = assign.subjectId;
          }
        }
        setClassNames(cNames);
        setSubjectNames(sNames);
        setClassData(cData);
      }

      // Fetch Assignments
      const myAssignments = await dbService.getTeacherAssignments(adminId, teacherId);
      setAssignments(myAssignments);

      // Fetch Submissions
      await refreshSubmissions(myAssignments);
    };

    fetchProfileAndNames();
  }, [teacherId, adminId]);

  const refreshSubmissions = async (currentAssignments: Assignment[] = assignments) => {
    const allSubmissions: Submission[] = [];
    for (const assignment of currentAssignments) {
      const assignmentSubs = await dbService.getSubmissionsByAssignment(adminId, assignment.id);
      allSubmissions.push(...assignmentSubs);
    }
    setSubmissions(allSubmissions);
  };

  const updateLocalSubmission = (updatedSub: Submission) => {
    setSubmissions(prev => prev.map(s => s.id === updatedSub.id ? updatedSub : s));
  };

  useEffect(() => {
    if (selectedAssignment?.status === 'DRAFT') {
      setDraftEdit({
        ...selectedAssignment,
        markingPoints: [...selectedAssignment.markingPoints],
        teacherAnswerImages: [...(selectedAssignment.teacherAnswerImages || [])],
        teacherAnswerImagesBase64: [...(selectedAssignment.teacherAnswerImagesBase64 || [])]
      });
      setDraftImageFiles([]);
      setDraftImagePreviews([]);
    } else {
      setDraftEdit(null);
    }
  }, [selectedAssignment]);

  const handleDraftImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDraftImageFiles(prev => [...prev, file]);
      const reader = new FileReader();
      reader.onloadend = () => setDraftImagePreviews(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    }
  };

  const persistDraft = async (nextStatus?: 'DRAFT' | 'PUBLISHED') => {
    if (!draftEdit) return null;
    const uploadedUrls: string[] = [];
    for (const file of draftImageFiles) {
      const path = `assignments/${teacherId}/${Date.now()}_${file.name}`;
      const url = await dbService.uploadImage(file, path);
      uploadedUrls.push(url);
    }

    const updatedImages = [...(draftEdit.teacherAnswerImages || []), ...uploadedUrls];
    const updatedBase64 = [...(draftEdit.teacherAnswerImagesBase64 || []), ...draftImagePreviews];

    const updatedAssignment: Assignment = {
      ...draftEdit,
      teacherAnswerImages: updatedImages,
      teacherAnswerImagesBase64: updatedBase64,
      status: nextStatus || draftEdit.status
    };

    await dbService.saveAssignment(adminId, updatedAssignment);
    setAssignments(prev => prev.map(a => a.id === updatedAssignment.id ? updatedAssignment : a));
    setSelectedAssignment(updatedAssignment);
    setDraftEdit(updatedAssignment);
    setDraftImageFiles([]);
    setDraftImagePreviews([]);
    return updatedAssignment;
  };

  const uniqueAssignedSubjects = Array.from(new Set(teacher?.assignedSubjects.map(s => s.subjectId)))
    .map(id => ({ id, name: subjectNames[id] || id }));



  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceImages(prev => [...prev, file]);
      const reader = new FileReader();
      reader.onloadend = () => setReferenceImageUrls(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    }
  };

  const handleExtractCriteria = async () => {
    if (referenceImageUrls.length === 0) return;
    setIsExtracting(true);
    try {
      const points = await extractMarkingPoints(referenceImageUrls);
      setCriteria(points.map(p => ({ point: p, weight: 1 })));
    } catch (err) {
      alert("Failed to extract criteria");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async (status: 'DRAFT' | 'PUBLISHED') => {
    if (!title || !selectedSubjectId || !selectedClassId) {
      alert("Please fill all details and select a class/subject");
      return;
    }
    setIsSaving(true);
    try {
      // Upload images and keep base64 data
      const imageUrls: string[] = [];
      for (const file of referenceImages) {
        if (file instanceof File) {
          const path = `assignments/${teacherId}/${Date.now()}_${file.name}`;
          const url = await dbService.uploadImage(file, path);
          imageUrls.push(url);
        }
      }

      const newA: Assignment = {
        id: Date.now().toString(),
        title, question,
        teacherAnswerImages: imageUrls, // Storage URLs
        teacherAnswerImagesBase64: referenceImageUrls, // Base64 for Gemini
        markingPoints: criteria,
        createdAt: Date.now(),
        // Save Due Date
        dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
        allowLateSubmissions: allowLate,
        gradeId: 'extracted-from-class',
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        teacherId,
        status
      };

      await dbService.saveAssignment(adminId, newA);
      setAssignments(prev => [newA, ...prev]);
      setShowAdd(false);
      // Reset Form
      setTitle(''); setQuestion(''); setCriteria([]); setReferenceImages([]); setReferenceImageUrls([]); setDueDate(''); setAllowLate(true);
      alert(status === 'DRAFT' ? 'Draft saved!' : 'Assignment published!');
    } catch (err: any) {
      console.error(err);
      alert("Failed to save: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const drafts = assignments.filter(a => a.status === 'DRAFT');
  const published = assignments.filter(a => a.status === 'PUBLISHED');

  // Scanning State
  const [isScanning, setIsScanning] = useState(false);
  const [scanningAssignment, setScanningAssignment] = useState<Assignment | null>(null);

  // Async Scan Flow State
  const [scanProcessing, setScanProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<{ studentName: string | null, confidence: string } | null>(null);
  const [pendingScanImage, setPendingScanImage] = useState<string | null>(null);

  // Background Processing Queue
  type QueueItem = {
    id: string;
    studentName: string;
    status: 'uploading' | 'grading' | 'success' | 'error';
    timestamp: number;
    error?: string;
  };
  const [processingQueue, setProcessingQueue] = useState<QueueItem[]>([]);

  // ... (previous effects)

  const handleScanStart = (assignment: Assignment) => {
    setScanningAssignment(assignment);
    setIsScanning(true);
    setScanResult(null);
    setScanProcessing(false);
  };

  const handleScanCapture = async (imageData: string) => {
    if (!scanningAssignment) return;
    setScanProcessing(true);

    try {
      const compressedImage = await compressImage(imageData);
      setPendingScanImage(compressedImage); // Store for next step

      const students = await dbService.getStudentsByClass(adminId, scanningAssignment.classId);
      const studentNames = students.map(s => s.name);

      const identification = await identifyStudentName(compressedImage, studentNames);
      setScanResult(identification);

    } catch (err: any) {
      alert("Error identifying: " + err.message);
      setScanProcessing(false);
    } finally {
      setScanProcessing(false);
    }
  };

  const handleScanCancel = () => {
    setScanResult(null);
    setPendingScanImage(null);
    setScanProcessing(false);
  };

  const handleScanConfirm = async () => {
    if (!scanningAssignment || !scanResult || !pendingScanImage) return;

    const queueId = Date.now().toString();
    const studentName = scanResult.studentName || "Unknown Student";

    // 1. Add to Queue
    setProcessingQueue(prev => [{
      id: queueId,
      studentName,
      status: 'uploading',
      timestamp: Date.now()
    }, ...prev]);

    // 2. Start Background Job
    processSubmissionInBackground(queueId, pendingScanImage, scanResult.studentName, scanningAssignment);

    // 3. Reset UI immediately for next scan
    setScanResult(null);
    setPendingScanImage(null);
    // scanProcessing is already false
  };

  const processSubmissionInBackground = async (queueId: string, imageData: string, identifiedName: string | null, assignment: Assignment) => {
    try {
      const students = await dbService.getStudentsByClass(adminId, assignment.classId);
      let matchedStudent = students.find(s => s.name === identifiedName);

      // If not matched, we might still proceed but as "Unknown"? 
      // For now assume matched (verified by user in UI)
      if (!matchedStudent) {
        // Fallback for logic safety
        matchedStudent = { id: 'unknown', name: identifiedName || 'Unknown' } as any;
      }

      // Update Queue: Grading
      setProcessingQueue(prev => prev.map(i => i.id === queueId ? { ...i, status: 'grading' } : i));

      // Upload
      const studentImgUrl = await uploadBase64ToStorage(imageData, teacherId, `scan_${matchedStudent?.id}_${Date.now()}`);

      // Grade
      // If teacherAnswerImagesBase64 is empty, we warn? (Skip warning in background, just do best effors)
      const aiResult = await analyzeAnswer(assignment, [imageData]);

      // Save
      const submission: Submission = {
        id: crypto.randomUUID(),
        assignmentId: assignment.id,
        studentId: matchedStudent!.id,
        studentName: matchedStudent!.name,
        studentAnswerImages: [studentImgUrl],
        studentAnswerImagesBase64: [imageData],
        feedback: aiResult.feedback,
        score: aiResult.score,
        maxScore: aiResult.totalPossible,
        criteriaScores: aiResult.criteriasMet.map(met => met ? 1 : 0),
        criteriasMet: aiResult.criteriasMet,
        annotations: aiResult.annotations, // Save Annotations
        gradedAt: Date.now()
      };

      await dbService.saveSubmission(adminId, submission);

      // Update local state immediately (Optimistic/Confirmed Update)
      setSubmissions(prev => {
        // Remove existing if replacing (e.g. re-grade), otherwise add
        const filtered = prev.filter(s => s.id !== submission.id);
        return [submission, ...filtered];
      });

      // Success
      setProcessingQueue(prev => prev.map(i => i.id === queueId ? { ...i, status: 'success' } : i));

      // Remove from queue after 5 seconds to clean up?
      setTimeout(() => {
        setProcessingQueue(prev => prev.filter(i => i.id !== queueId));
      }, 8000);

    } catch (err: any) {
      console.error("Background processing failed", err);
      setProcessingQueue(prev => prev.map(i => i.id === queueId ? { ...i, status: 'error', error: err.message } : i));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[250] flex items-center gap-3 px-6 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-top-4 duration-300 ${notification.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <X className="w-5 h-5" />}
          <span className="font-bold">{notification.message}</span>
        </div>
      )}
      {/* Webcam Overlay */}
      <WebcamScanner
        isActive={isScanning}
        onClose={() => setIsScanning(false)}
        onCapture={handleScanCapture}
        isProcessing={scanProcessing}
        scanResult={scanResult}
        onScanConfirm={handleScanConfirm}
        onScanCancel={handleScanCancel}
      />

      {/* Processing Queue Overlay (Visible Global) */}
      <div className="fixed bottom-4 right-4 z-[110] flex flex-col gap-2 pointer-events-none">
        {processingQueue.map(item => (
          <div key={item.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 flex items-center gap-3 animate-in slide-in-from-right duration-300 w-72 pointer-events-auto">
            <div className="relative">
              {item.status === 'uploading' && <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>}
              {item.status === 'grading' && <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center animate-pulse"><img src="/ai-icon.png" className="w-4 h-4" alt="AI" onError={(e) => (e.currentTarget.style.display = 'none')} />✨</div>}
              {item.status === 'success' && <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center"><CheckCircle className="w-5 h-5" /></div>}
              {item.status === 'error' && <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center"><X className="w-5 h-5" /></div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{item.studentName}</p>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                {item.status === 'uploading' && 'Uploading...'}
                {item.status === 'grading' && 'AI Grading...'}
                {item.status === 'success' && 'Done'}
                {item.status === 'error' && 'Failed'}
              </p>
            </div>
            {item.status === 'error' && (
              <button onClick={() => setProcessingQueue(prev => prev.filter(i => i.id !== item.id))} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            )}
          </div>
        ))}
      </div>
      <Routes>
        <Route path="/" element={<TeacherOverview teacher={teacher} assignments={assignments} submissions={submissions} />} />

        <Route path="/assignments" element={
          <div className="space-y-8">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Assignments</h2>
                <p className="text-slate-500 font-medium">Create and manage your grading assignments</p>
              </div>
              <button onClick={() => setShowAdd(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-bold transition-all hover:-translate-y-1 active:scale-95 shadow-lg shadow-indigo-200 dark:shadow-none">
                + Create Assignment
              </button>
            </div>

            {/* PUBLISHED */}
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-slate-400 uppercase tracking-widest pl-2 border-l-4 border-indigo-500">Active Assignments</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {published.map(a => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    onClick={() => setSelectedAssignment(a)}
                    onScan={() => handleScanStart(a)}
                  />
                ))}
                {published.length === 0 && (
                  <div className="col-span-full py-10 text-center text-slate-400 italic">No active assignments. Create one or publish a draft.</div>
                )}
              </div>
            </div>

            {/* DRAFTS */}
            {drafts.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-400 uppercase tracking-widest pl-2 border-l-4 border-slate-300 dark:border-slate-700">Drafts</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {drafts.map(a => (
                    <AssignmentCard key={a.id} assignment={a} onClick={() => setSelectedAssignment(a)} isDraft />
                  ))}
                </div>
              </div>
            )}

          </div>
        } />

        <Route path="/grades" element={
          <TeacherGradebook
            assignments={assignments}
            submissions={submissions}
            classNames={classNames}
            subjectNames={subjectNames}
            adminId={adminId}
            onUpdateSubmission={updateLocalSubmission}
            onRefresh={() => refreshSubmissions()}
            onSuccess={(msg) => showNotification(msg, 'success')}
            onError={(msg) => showNotification(msg, 'error')}
          />
        } />

        <Route path="/students" element={
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Student Management</h2>
            {teacher?.isClassTeacher && (
              <MyClassView teacher={teacher} adminId={adminId} />
            )}
            <SubjectStudentsView teacher={teacher} adminId={adminId} />
          </div>
        } />

        <Route path="/notes" element={
          <TeacherNotes
            teacher={teacher}
            teacherId={teacherId}
            adminId={adminId}
            classNames={classNames}
            subjectNames={subjectNames}
            classData={classData}
            onDraftsCreated={(drafts) => setAssignments(prev => [...drafts, ...prev])}
          />
        } />

        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Routes>

      {/* Modals */}
      {
        selectedAssignment && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] w-full max-w-2xl p-10 shadow-2xl animate-in zoom-in-95 duration-300">
              {selectedAssignment.status === 'DRAFT' && draftEdit ? (
                <div className="space-y-2 mb-3">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Assignment Title</label>
                  <input
                    className="input-style"
                    value={draftEdit.title}
                    onChange={e => setDraftEdit({ ...draftEdit, title: e.target.value })}
                  />
                </div>
              ) : (
                <h3 className="text-2xl font-black mb-1">{selectedAssignment.title}</h3>
              )}
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">assignment Created on {new Date(selectedAssignment.createdAt).toLocaleDateString()}</p>

              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                <div className="bg-slate-50 dark:bg-slate-700/60 p-6 rounded-3xl border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mb-2">Reference Question</p>
                  {selectedAssignment.status === 'DRAFT' && draftEdit ? (
                    <textarea
                      className="input-style h-32"
                      value={draftEdit.question}
                      onChange={e => setDraftEdit({ ...draftEdit, question: e.target.value })}
                    />
                  ) : (
                    <p className="text-slate-600 dark:text-slate-300 font-medium leading-relaxed">{selectedAssignment.question}</p>
                  )}
                </div>

                {(selectedAssignment.status === 'DRAFT' || (selectedAssignment.teacherAnswerImages && selectedAssignment.teacherAnswerImages.length > 0) || (draftEdit && (draftEdit.teacherAnswerImages?.length || 0) > 0) || (draftImagePreviews.length > 0)) && (
                  <div className="space-y-3">
                    <h4 className="text-xl font-black">Question Images</h4>
                    <div className="flex flex-wrap gap-3">
                      {(selectedAssignment.status === 'DRAFT' ? (draftEdit?.teacherAnswerImages || []) : (selectedAssignment.teacherAnswerImages || [])).map((img, idx) => (
                        <div
                          key={`existing-${idx}`}
                          className="relative w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer"
                          onClick={() => window.open(img, '_blank')}
                          title="Open image"
                        >
                          <img src={img} className="w-full h-full object-cover" />
                          {selectedAssignment.status === 'DRAFT' && draftEdit && (
                            <button
                              onClick={() => {
                                const updatedImages = draftEdit.teacherAnswerImages?.filter((_, i) => i !== idx) || [];
                                const updatedBase64 = draftEdit.teacherAnswerImagesBase64?.filter((_, i) => i !== idx) || [];
                                setDraftEdit({
                                  ...draftEdit,
                                  teacherAnswerImages: updatedImages,
                                  teacherAnswerImagesBase64: updatedBase64
                                });
                              }}
                              className="absolute top-1 right-1 bg-white/90 dark:bg-slate-700/90 rounded-full w-5 h-5 text-xs flex items-center justify-center shadow-sm"
                              title="Remove image"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}

                      {draftImagePreviews.map((img, idx) => (
                        <div
                          key={`new-${idx}`}
                          className="relative w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer"
                          onClick={() => window.open(img, '_blank')}
                          title="Open image"
                        >
                          <img src={img} className="w-full h-full object-cover" />
                          <button
                            onClick={() => {
                              setDraftImageFiles(draftImageFiles.filter((_, i) => i !== idx));
                              setDraftImagePreviews(draftImagePreviews.filter((_, i) => i !== idx));
                            }}
                            className="absolute top-1 right-1 bg-white/90 dark:bg-slate-700/90 rounded-full w-5 h-5 text-xs flex items-center justify-center shadow-sm"
                            title="Remove image"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      {selectedAssignment.status === 'DRAFT' && (
                        <label className="w-24 h-24 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-all hover:border-indigo-400 active:scale-95">
                          <input type="file" accept="image/*" onChange={handleDraftImageChange} className="hidden" />
                          <span className="text-3xl text-slate-300 font-light">+</span>
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {selectedAssignment.status === 'DRAFT' && draftEdit && (
                  <div className="space-y-3">
                    <h4 className="text-xl font-black">Marking Criteria</h4>
                    <div className="space-y-2">
                      {draftEdit.markingPoints.map((c, i) => (
                        <div key={i} className="flex gap-2 items-center bg-slate-50 dark:bg-slate-700/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                          <span className="text-xs font-black text-indigo-600 bg-white dark:bg-slate-800 w-6 h-6 rounded-lg flex items-center justify-center shadow-sm">{i + 1}</span>
                          <input
                            className="bg-transparent border-none text-sm font-bold flex-1 focus:ring-0"
                            value={c.point}
                            onChange={e => {
                              const updated = [...draftEdit.markingPoints];
                              updated[i] = { ...updated[i], point: e.target.value };
                              setDraftEdit({ ...draftEdit, markingPoints: updated });
                            }}
                          />
                          <input
                            type="number"
                            className="w-16 bg-white dark:bg-slate-800 border-none rounded-lg text-sm font-black text-center focus:ring-1 focus:ring-indigo-500"
                            value={c.weight}
                            onChange={e => {
                              const updated = [...draftEdit.markingPoints];
                              updated[i] = { ...updated[i], weight: parseInt(e.target.value) || 0 };
                              setDraftEdit({ ...draftEdit, markingPoints: updated });
                            }}
                          />
                          <button
                            onClick={() => {
                              const updated = draftEdit.markingPoints.filter((_, idx) => idx !== i);
                              setDraftEdit({ ...draftEdit, markingPoints: updated });
                            }}
                            className="w-6 h-6 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 flex items-center justify-center transition-colors"
                            title="Delete criterion"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => setDraftEdit({ ...draftEdit, markingPoints: [...draftEdit.markingPoints, { point: '', weight: 1 }] })}
                        className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-400 hover:border-indigo-400 hover:text-indigo-400 transition-all"
                      >
                        + Add Rule
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <h4 className="text-xl font-black">Student Submissions</h4>

                  {(() => {
                    const assignmentSubmissions = submissions.filter(s => s.assignmentId === selectedAssignment.id);
                    const submittedCount = assignmentSubmissions.length;
                    const uniqueStudentIds = new Set(assignmentSubmissions.map(s => s.studentId));
                    const uniqueSubmittedCount = uniqueStudentIds.size;

                    // Get total students in the class
                    const assignmentClass = classData[selectedAssignment.classId];
                    const totalStudents = assignmentClass?.studentIds?.length || 0;
                    const pendingCount = totalStudents - uniqueSubmittedCount;

                    return (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-200 dark:border-emerald-900 rounded-2xl p-6 text-center">
                          <div className="text-4xl font-black text-emerald-600 dark:text-emerald-400 mb-2">{submittedCount}</div>
                          <p className="text-xs font-bold text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-widest">Submitted</p>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-200 dark:border-amber-900 rounded-2xl p-6 text-center">
                          <div className="text-4xl font-black text-amber-600 dark:text-amber-400 mb-2">
                            {pendingCount >= 0 ? pendingCount : '—'}
                          </div>
                          <p className="text-xs font-bold text-amber-600/70 dark:text-amber-400/70 uppercase tracking-widest">Pending</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="pt-8 mt-4 border-t border-slate-100 dark:border-slate-700">
                {selectedAssignment.status === 'DRAFT' ? (
                  <div className="flex gap-4">
                    <button
                      onClick={() => setSelectedAssignment(null)}
                      className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all active:scale-95"
                    >
                      Close
                    </button>
                    <button
                      disabled={isSaving || !draftEdit}
                      onClick={async () => {
                        if (!draftEdit) return;
                        setIsSaving(true);
                        try {
                          await persistDraft('DRAFT');
                          alert('Draft updated!');
                        } catch (err: any) {
                          alert('Failed to update draft: ' + err.message);
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      className="flex-1 py-4 bg-slate-900 dark:bg-slate-200 text-white dark:text-slate-900 rounded-2xl font-black shadow-xl transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      disabled={isSaving}
                      onClick={async () => {
                        setIsSaving(true);
                        try {
                          const updatedAssignment = await persistDraft('PUBLISHED');
                          setSelectedAssignment(null);
                          alert('Assignment published successfully!');
                        } catch (err: any) {
                          alert('Failed to publish: ' + err.message);
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 dark:shadow-none transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isSaving ? 'Publishing...' : '📢 Publish Now'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedAssignment(null)}
                    className="w-full py-4 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl font-black shadow-xl transition-all active:scale-95"
                  >
                    Return to Dashboard
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      }

      {
        showAdd && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] w-full max-w-2xl p-10 shadow-2xl overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-300">
              <h3 className="text-3xl font-black mb-8">Create Assignment assignment</h3>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Class</label>
                    <select className="input-style" value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}>
                      <option value="">Select Class</option>
                      {teacher?.assignedClassId && <option value={teacher.assignedClassId}>{classNames[teacher.assignedClassId] || teacher.assignedClassId} (Class Teacher)</option>}
                      {teacher?.assignedSubjects.map((s, i) => (
                        <option key={i} value={s.classId}>{classNames[s.classId] || s.classId} ({subjectNames[s.subjectId] || s.subjectId})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Subject</label>
                    <select className="input-style" value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)}>
                      <option value="">Select Subject</option>
                      {teacher?.primarySubject && !uniqueAssignedSubjects.some(s => s.name === teacher.primarySubject) && (
                        <option value={teacher.primarySubject}>{teacher.primarySubject}</option>
                      )}
                      {uniqueAssignedSubjects.map((s, i) => (
                        <option key={i} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Assignment Title</label>
                  <input className="input-style" placeholder="Ex: Physics Mid-term" value={title} onChange={e => setTitle(e.target.value)} />
                </div>

                <div className="flex gap-4">
                  <div className="space-y-2 flex-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Due Date (Optional)</label>
                    <input
                      type="datetime-local"
                      className="input-style w-full"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 flex-1 flex flex-col justify-end pb-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={allowLate}
                        onChange={e => setAllowLate(e.target.checked)}
                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all"
                      />
                      <span className="text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-indigo-600 transition-colors">Allow Late Submissions</span>
                    </label>
                    <p className="text-[10px] text-slate-400 pl-8">If disabled, students strictly cannot submit after deadline.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Question / Instructions</label>
                  <textarea className="input-style h-40" placeholder="Enter the full question text here..." value={question} onChange={e => setQuestion(e.target.value)} />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Correct Solution (Reference Images)</label>
                  <div className="flex flex-wrap gap-3">
                    {referenceImageUrls.map((img, idx) => (
                      <div key={idx} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm animate-in zoom-in duration-200">
                        <img src={img} className="w-full h-full object-cover" />
                        <button onClick={() => {
                          setReferenceImages(referenceImages.filter((_, i) => i !== idx));
                          setReferenceImageUrls(referenceImageUrls.filter((_, i) => i !== idx));
                        }} className="absolute top-1 right-1 bg-white/90 dark:bg-slate-700/90 rounded-full w-5 h-5 text-xs flex items-center justify-center shadow-sm">✕</button>
                      </div>
                    ))}
                    <label className="w-24 h-24 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-all hover:border-indigo-400 active:scale-95">
                      <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                      <span className="text-3xl text-slate-300 font-light">+</span>
                    </label>
                  </div>
                  {referenceImageUrls.length > 0 && criteria.length === 0 && (
                    <button onClick={handleExtractCriteria} disabled={isExtracting} className={`w-full py-3 ${isExtracting ? 'bg-slate-100 dark:bg-slate-700 animate-pulse text-slate-400' : 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300'} rounded-2xl text-sm font-black uppercase tracking-widest transition-all`}>
                      {isExtracting ? 'AI Analyzing Reference...' : '✨ Auto-Extract Marking Points'}
                    </button>
                  )}
                </div>

                {criteria.length > 0 && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Marking Criteria & Weights</label>
                    <div className="space-y-2">
                      {criteria.map((c, i) => (
                        <div key={i} className="flex gap-2 items-center bg-slate-50 dark:bg-slate-700/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700 animate-in slide-in-from-left duration-200" style={{ animationDelay: `${i * 50}ms` }}>
                          <span className="text-xs font-black text-indigo-600 bg-white dark:bg-slate-800 w-6 h-6 rounded-lg flex items-center justify-center shadow-sm">{i + 1}</span>
                          <input className="bg-transparent border-none text-sm font-bold flex-1 focus:ring-0" value={c.point} onChange={e => {
                            const newC = [...criteria];
                            newC[i].point = e.target.value;
                            setCriteria(newC);
                          }} />
                          <input type="number" className="w-16 bg-white dark:bg-slate-800 border-none rounded-lg text-sm font-black text-center focus:ring-1 focus:ring-indigo-500" value={c.weight} onChange={e => {
                            const newC = [...criteria];
                            newC[i].weight = parseInt(e.target.value) || 0;
                            setCriteria(newC);
                          }} />
                          <button
                            onClick={() => setCriteria(criteria.filter((_, idx) => idx !== i))}
                            className="w-6 h-6 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 flex items-center justify-center transition-colors"
                            title="Delete criterion"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setCriteria([...criteria, { point: '', weight: 1 }])} className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-400 hover:border-indigo-400 hover:text-indigo-400 transition-all">+ Add Rule</button>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-8">
                  <button
                    onClick={() => setShowAdd(false)}
                    className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={isSaving}
                    onClick={() => handleSave('DRAFT')}
                    className="flex-1 py-4 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-2xl font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Draft'}
                  </button>
                  <button
                    disabled={isSaving}
                    onClick={() => handleSave('PUBLISHED')}
                    className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 dark:shadow-none transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? 'Publishing...' : 'Publish assignment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

const TeacherOverview: React.FC<{ teacher: Teacher | null, assignments: Assignment[], submissions: Submission[] }> = ({ teacher, assignments, submissions }) => {
  const [className, setClassName] = useState<string>('');
  const activeCount = assignments.filter(a => a.status === 'PUBLISHED').length;
  const draftCount = assignments.filter(a => a.status === 'DRAFT').length;

  useEffect(() => {
    const fetchClassName = async () => {
      if (teacher?.assignedClassId && teacher.schoolId) {
        const cls = await dbService.getClass(teacher.schoolId, teacher.assignedClassId);
        if (cls) setClassName(cls.name);
      }
    };
    fetchClassName();
  }, [teacher]);

  if (!teacher) return null;

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Welcome back, {teacher.name.split(' ')[0]}!</h1>
        <p className="text-slate-500 dark:text-slate-300 font-medium">Here's what's happening in your classes today.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-8 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-2xl">🏫</div>
            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg text-[10px] font-black uppercase text-slate-500 tracking-wider">My Class</span>
          </div>
          {teacher.isClassTeacher && teacher.assignedClassId ? (
            <>
              <p className="text-3xl font-black text-slate-900 dark:text-white mb-1">Class {className || 'Loading...'}</p>
              <p className="text-slate-500 font-medium text-sm">You are the class teacher</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-slate-400 mb-1">No Class Assigned</p>
              <p className="text-slate-500 font-medium text-sm">Ask admin to assign one</p>
            </>
          )}
        </div>

        <div className="p-8 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-purple-50 dark:bg-purple-950/40 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400 text-2xl">📚</div>
            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg text-[10px] font-black uppercase text-slate-500 tracking-wider">Subjects</span>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white mb-1">{teacher.primarySubject}</p>
          <p className="text-slate-500 font-medium text-sm">{teacher.assignedSubjects.length} Classes Assigned</p>
        </div>

        <div className="p-8 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-2xl">📝</div>
            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg text-[10px] font-black uppercase text-slate-500 tracking-wider">Activity</span>
          </div>
          <div className="flex items-end gap-3 mb-2">
            <p className="text-3xl font-black text-slate-900 dark:text-white">{activeCount}</p>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Active</p>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
            <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-500">Drafts</span>
            <span className="text-slate-700 dark:text-slate-200">{draftCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const MyClassView: React.FC<{ teacher: Teacher, adminId: string }> = ({ teacher, adminId }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (teacher.assignedClassId) {
      dbService.getStudentsByClass(adminId, teacher.assignedClassId).then(setStudents);
    }
  }, [teacher.assignedClassId, adminId]);

  const handleAdd = async () => {
    if (!name || !email || !password || !teacher.assignedClassId) {
      alert("All fields including temporary password are required.");
      return;
    }

    setIsAdding(true);
    try {
      // Fetch class details to get the correct gradeId
      const cls = await dbService.getClass(teacher.schoolId, teacher.assignedClassId);
      const correctGradeId = cls ? cls.gradeId : 'unknown';

      // 1. Create the Auth account
      const uid = await dbService.createUserAccount(email, password);

      // 2. Create the Student Profile
      const studentProfile: Omit<Student, 'id'> = {
        name, email,
        schoolId: teacher.schoolId,
        classId: teacher.assignedClassId,
        gradeId: correctGradeId
      };

      await dbService.createStudentProfile(adminId, uid, studentProfile, password);

      setStudents([...students, { id: uid, ...studentProfile }]);
      setName(''); setEmail(''); setPassword('');
      alert(`Student account created for ${email}! They can now login with the password you set.`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to create student account: " + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (student: Student) => {
    if (!confirm(`Are you sure you want to remove ${student.name}? This cannot be undone.`)) return;

    try {
      await dbService.deleteStudent(adminId, student);
      setStudents(students.filter(s => s.id !== student.id));
    } catch (err: any) {
      alert("Failed to delete student: " + err.message);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
      <h3 className="text-xl font-bold mb-6">My Class Students</h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <input placeholder="Student Name" value={name} onChange={e => setName(e.target.value)} className="input-style" />
        <input placeholder="Student Email" value={email} onChange={e => setEmail(e.target.value)} className="input-style" />
        <input type="password" placeholder="Temp Password" value={password} onChange={e => setPassword(e.target.value)} className="input-style" />
        <button
          onClick={handleAdd}
          disabled={isAdding}
          className={`bg-indigo-600 hover:bg-indigo-700 text-white px-8 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-indigo-100 dark:shadow-none ${isAdding ? 'opacity-50' : ''}`}
        >
          {isAdding ? 'Creating...' : 'Add Student'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {students.map(s => (
          <div key={s.id} className="p-5 bg-slate-50 dark:bg-slate-700/60 rounded-2xl border border-transparent hover:border-indigo-500/30 transition-all group flex justify-between items-center">
            <div>
              <p className="font-bold group-hover:text-indigo-600 transition-colors">{s.name}</p>
              <p className="text-xs text-slate-500 font-medium">{s.email}</p>
            </div>
            <button
              onClick={() => handleDelete(s)}
              className="text-slate-300 hover:text-red-500 transition-colors p-2"
              title="Remove Student"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const SubjectStudentsView: React.FC<{ teacher: Teacher | null, adminId: string }> = ({ teacher, adminId }) => {
  if (!teacher) return null;
  return (
    <div className="space-y-6 mt-6">
      <h3 className="text-xl font-bold">Subject Classes</h3>
      {teacher.assignedSubjects.map((sub, i) => (
        <SubjectClassRow key={i} subject={sub} adminId={adminId} />
      ))}
    </div>
  );
};

const SubjectClassRow: React.FC<{ subject: any, adminId: string }> = ({ subject, adminId }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [className, setClassName] = useState(subject.classId);
  const [subjectName, setSubjectName] = useState(subject.subjectId);

  useEffect(() => {
    dbService.getStudentsByClass(adminId, subject.classId).then(setStudents);

    // Fetch names
    dbService.getClass(adminId, subject.classId).then(c => {
      if (c) setClassName(c.name);
    });

    // Check if subject.subjectId looks like an ID (alphanumeric) or name
    // If it's an ID, try to fetch it.
    if (subject.subjectId) {
      dbService.getSubject(adminId, subject.subjectId).then(s => {
        if (s) setSubjectName(s.name);
        else setSubjectName(subject.subjectId); // Fallback to ID if not found (or if it was a name)
      });
    }

  }, [subject.classId, subject.subjectId, adminId]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:border-indigo-500/30 transition-all">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-black text-indigo-600">Class {className} - {subjectName}</h4>
        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg text-[10px] font-black uppercase text-slate-500 tracking-wider">
          {students.length} Students
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {students.map(s => <span key={s.id} className="px-4 py-2 bg-slate-50 dark:bg-slate-700/60 rounded-xl text-xs font-bold border border-slate-100 dark:border-slate-600/60">{s.name}</span>)}
      </div>
    </div>
  );
};

// Global counter for unique Mermaid IDs across the application usage
const generateMermaidId = () => {
  return `mermaid-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
};

const markdownToHtml = (markdown: string, isDarkMode: boolean = false): string => {
  let html = markdown;
  const blocks: string[] = [];

  const darkStyles = isDarkMode ? {
    textColor: '#f3f4f6',
    headingColor: '#ffffff',
    codeBlockBg: '#374151',
    codeBlockColor: '#f3f4f6',
    inlineCodeBg: '#4b5563',
    inlineCodeColor: '#f3f4f6',
    quoteColor: '#d1d5db',
    quoteBorder: '#9ca3af',
    tableBorder: '#6b7280',
    tableHeaderBg: '#374151',
    tableRowBg1: 'transparent',
    tableRowBg2: '#1f2937',
    hrBorder: '#6b7280'
  } : {
    textColor: '#1f2937',
    headingColor: '#111827',
    codeBlockBg: '#f9fafb',
    codeBlockColor: '#1f2937',
    inlineCodeBg: '#e5e7eb',
    inlineCodeColor: '#1f2937',
    quoteColor: '#4b5563',
    quoteBorder: '#d1d5db',
    tableBorder: '#e5e7eb',
    tableHeaderBg: '#f3f4f6',
    tableRowBg1: '#ffffff',
    tableRowBg2: '#f9fafb',
    hrBorder: '#e5e7eb'
  };

  // Helper to escape HTML characters in code blocks
  const escapeHtml = (unsafe: string) => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Helper to mask blocks with a unique placeholder
  const mask = (regex: RegExp, formatter: (match: string, ...args: any[]) => string) => {
    html = html.replace(regex, (match, ...args) => {
      const content = formatter(match, ...args);
      // Use a safe, unique placeholder not likely to be in user text
      const placeholder = `\u0000_B_${blocks.length}_B_\u0000`;
      blocks.push(content);
      return placeholder;
    });
  };

  // 1. Masking Phase - Protect complex blocks from being broken by paragraph/inline logic

  // Mask Reaction Blocks (Animated)
  mask(/^[ \t]*(`{3,}|~{3,})reaction\s*[\r\n]+([\s\S]*?)[\r\n]+[ \t]*\1/gm, (_, fence, content) => {
    // Split by operators (+, ->, =, →) while keeping delimiters
    const parts = content.trim().split(/(\+|->|→|=)/g).map(s => s.trim()).filter(Boolean);

    let reactionHtml = `<div class="reaction-wrapper flex flex-wrap items-center justify-center gap-4 my-8 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700">`;

    parts.forEach((part, index) => {
      const isOperator = ['+', '->', '→', '='].includes(part);
      const delay = index * 200; // Stagger animation

      // Render content (try KaTeX for formulas, or plain text for operators)
      let renderedPart = part;
      if (!isOperator) {
        try {
          renderedPart = katex.renderToString(part, { displayMode: false, throwOnError: false });
        } catch { } // Fallback to text
      } else {
        // Style operators
        renderedPart = `<span class="text-2xl font-black text-slate-400 dark:text-slate-500">${part}</span>`;
      }

      reactionHtml += `<div class="reaction-part animate-fade-in-up" style="animation-delay: ${delay}ms;">${renderedPart}</div>`;
    });

    reactionHtml += `</div>`;
    return reactionHtml;
  });

  // Mask SMILES Blocks (2D Molecules)
  mask(/^[ \t]*(`{3,}|~{3,})smiles\s*[\r\n]+([\s\S]*?)[\r\n]+[ \t]*\1/gm, (_, fence, content) => {
    const smiles = content.trim();
    // Generate a unique ID for this canvas
    const id = `smiles-${Math.random().toString(36).substr(2, 9)}`;
    // We defer the actual drawing to the React component or a separate effect,
    // but here we just produce the container.
    // However, since markdownToHtml is pure string manipulation, we need a way to trigger the drawing.
    // We will use a script tag or a custom element that the useEffect can pick up? 
    // BETTER: Use the same pattern as Mermaid -> Render a specific container and let useEffect find it.

    return `<div class="smiles-wrapper flex justify-center my-6 p-4 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-slate-700/50" data-smiles="${smiles}" id="${id}">
              <canvas id="canvas-${id}" width="400" height="300"></canvas>
            </div>`;
  });

  // Mask Mermaid (Support ``` and ~~~, and optional leading whitespace)
  mask(/^[ \t]*(`{3,}|~{3,})mermaid\s*[\r\n]+([\s\S]*?)[\r\n]+[ \t]*\1/gm, (_, fence, code) => {
    // Use unique ID to prevent conflicts
    const id = generateMermaidId();
    // Escape the code to prevent HTML injection/breaking inside <pre>
    const escapedCode = escapeHtml(code.trim());

    return `<div class="mermaid-container" style="margin: 24px 0; width: 100%;">` +
      `<div class="mermaid-loading" style="font-size: 0.8em; color: gray; margin-bottom: 5px; font-style: italic;">Rendering diagram...</div>` +
      `<div class="mermaid-wrapper" style="background: ${isDarkMode ? '#1f2937' : '#ffffff'}; padding: 24px; border-radius: 12px; border: 1px solid ${darkStyles.tableBorder}; overflow-x: auto; text-align: center;">` +
      `<pre class="mermaid" id="${id}" style="display: block; margin: 0 auto; text-align: left;">${escapedCode}</pre>` +
      `</div>` +
      `</div>`;
  });

  // Mask LaTeX Display ($$ ... $$)
  mask(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    try {
      return `<div class="math-display" style="margin: 20px 0; padding: 10px; overflow-x: auto; background: ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}; border-radius: 8px;">${katex.renderToString(latex.trim(), {
        displayMode: true,
        throwOnError: false,
        trust: true
      })}</div>`;
    } catch (e) {
      console.error("KaTeX rendering error:", e, latex);
      return `<pre style="color: red; font-size: 0.9em; padding: 10px; border: 1px solid red; border-radius: 4px;">Error rendering formula: ${e instanceof Error ? e.message : String(e)}</pre>`;
    }
  });

  // Mask Tables (Robust matching for pipe tables)
  mask(/^\|(.+)\n\|[-\s:|]+\n((?:\|.+\n?)*)/gm, (match) => { // Added ^ anchor and multiline flag
    const lines = match.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return match;

    // Helper to process cell content (math, bold, italic) since tables are masked before global processing
    const processCell = (content: string) => {
      let processed = content.trim();
      // Render Inline Math ($...$)
      processed = processed.replace(/\$([^$\n]+?)\$/g, (_, latex) => {
        try {
          return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false, trust: true });
        } catch (e) { return _; }
      });
      // Render Bold (**...**)
      processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Render Italic (*...*)
      processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
      return processed;
    };

    const headerRow = lines[0].split('|').map(cell => processCell(cell)).filter(c => c !== '');
    // Note: slice(2) skips header and separator line
    const bodyRows = lines.slice(2).map(line => {
      // Split by pipe but ignore escaped pipes if possible (simple split for now)
      return line.split('|').map(cell => processCell(cell)).filter((_, i, arr) => {
        // Filter empty start/end cells caused by leading/trailing pipes
        if (i === 0 && _ === '') return false;
        if (i === arr.length - 1 && _ === '') return false;
        return true;
      });
    });

    let table = `<div style="overflow-x: auto; margin: 20px 0;"><table style="width: 100%; border-collapse: collapse; border: 1px solid ${darkStyles.tableBorder}; border-radius: 8px;">`;
    table += `<thead><tr style="background-color: ${darkStyles.tableHeaderBg}; border-bottom: 2px solid ${darkStyles.tableBorder};">`;
    headerRow.forEach(cell => { table += `<th style="padding: 14px; text-align: left; font-weight: 800; color: ${darkStyles.headingColor}; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em;">${cell}</th>`; });
    table += '</tr></thead><tbody>';
    bodyRows.forEach((row, idx) => {
      table += `<tr style="background-color: ${idx % 2 === 0 ? darkStyles.tableRowBg1 : darkStyles.tableRowBg2}; border-bottom: 1px solid ${darkStyles.tableBorder};">`;
      row.forEach(cell => { table += `<td style="padding: 14px; color: ${darkStyles.textColor}; font-size: 0.95em;">${cell}</td>`; });
      table += '</tr>';
    });
    table += '</tbody></table></div>';
    return table;
  });

  // Mask Code Blocks (Generic)
  mask(/^[ \t]*(`{3,}|~{3,})(?!mermaid)([\s\S]*?)[\r\n]+[ \t]*\1/gm, (_, fence, code) => {
    // Escape generic code blocks too
    const escapedCode = escapeHtml(code.trim());
    return `<pre style="background: ${darkStyles.codeBlockBg}; color: ${darkStyles.codeBlockColor}; padding: 16px; border-radius: 12px; overflow-x: auto; margin: 20px 0; border: 1px solid ${darkStyles.tableBorder}; font-family: 'JetBrains Mono', monospace; font-size: 0.9em;"><code>${escapedCode}</code></pre>`;
  });

  // Mask Inline LaTeX ($ ... $)
  mask(/\$([^$\n]+?)\$/g, (match, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false, trust: true });
    } catch (e) {
      return match;
    }
  });

  // 2. Transformation Phase - Standard Markdown
  html = html
    // Headers
    .replace(/^# (.*?)$/gm, `<h1 style="font-size: 2.25em; font-weight: 900; margin: 32px 0 16px; color: ${darkStyles.headingColor}; letter-spacing: -0.02em;">$1</h1>`)
    .replace(/^## (.*?)$/gm, `<h2 style="font-size: 1.75em; font-weight: 800; margin: 28px 0 14px; color: ${darkStyles.headingColor}; letter-spacing: -0.01em; border-bottom: 2px solid ${isDarkMode ? '#374151' : '#f1f5f9'}; padding-bottom: 8px;">$1</h2>`)
    .replace(/^### (.*?)$/gm, `<h3 style="font-size: 1.35em; font-weight: 700; margin: 24px 0 12px; color: ${darkStyles.headingColor};">$1</h3>`)
    .replace(/^#### (.*?)$/gm, `<h4 style="font-size: 1.2em; font-weight: 700; margin: 20px 0 10px; color: ${darkStyles.headingColor};">$1</h4>`)
    .replace(/^##### (.*?)$/gm, `<h5 style="font-size: 1.1em; font-weight: 700; margin: 16px 0 8px; color: ${darkStyles.headingColor};">$1</h5>`)
    .replace(/^###### (.*?)$/gm, `<h6 style="font-size: 1em; font-weight: 700; margin: 16px 0 8px; color: ${darkStyles.headingColor}; text-transform: uppercase;">$1</h6>`)
    // Bold/Italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Inline Code
    .replace(/`(.*?)`/g, (_, code) => `<code style="background: ${darkStyles.inlineCodeBg}; color: ${darkStyles.inlineCodeColor}; padding: 2px 6px; border-radius: 6px; font-family: monospace; font-size: 0.9em;">${escapeHtml(code)}</code>`)
    // Blockquotes
    .replace(/^> (.*?)$/gm, `<blockquote style="border-left: 4px solid ${darkStyles.quoteBorder}; padding: 8px 20px; margin: 20px 0; color: ${darkStyles.quoteColor}; background: ${isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'}; border-radius: 0 12px 12px 0; font-style: italic;">$1</blockquote>`)
    // HR
    .replace(/^---$/gm, `<hr style="margin: 32px 0; border: none; border-top: 2px solid ${darkStyles.hrBorder};" />`)
    // Lists
    .replace(/^\- (.*?)$/gm, '<li>$1</li>');

  // Wrap groups of <li> into <ul>
  html = html.replace(/(<li>.*<\/li>)+/g, (match) => `<ul style="list-style: disc; margin: 20px 0 20px 24px; color: ${darkStyles.textColor}; space-y: 8px;">${match}</ul>`);

  html = html
    // Images
    // Images - Add group for relative positioning of crop button
    // Images - Add group for relative positioning of crop button
    // Images - Add group for relative positioning of crop button
    .replace(/!\[(.*?)\]\((.*?)\)/g, (_, alt, src) => {
      let urlObj: URL;
      try {
        urlObj = new URL(src);
      } catch (e) {
        // Fallback for relative URLs if any (though typically we use absolute)
        urlObj = new URL(src, window.location.origin);
      }

      const params = urlObj.searchParams;
      const crop = params.get('crop');

      // Remove crop param for the display URL so it doesn't mess with backend if not supported
      // But KEEP other params like Firebase tokens!
      params.delete('crop');
      const displayUrl = urlObj.toString();

      // For the crop button data-src, we generally want the clean URL too
      const cleanSrc = displayUrl;

      let styles = 'max-width: 100%; height: auto; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); cursor: pointer;';
      let containerStyles = 'margin: 24px 0; text-align: center; position: relative; display: inline-block;';
      let imgStyles = styles;

      if (crop) {
        // Parse ymin,xmin,ymax,xmax (0-1000 scale)
        const [ymin, xmin, ymax, xmax] = crop.split(',').map(Number);

        if (!isNaN(ymin) && !isNaN(xmin) && !isNaN(ymax) && !isNaN(xmax)) {
          // Calculate percentages
          const width = xmax - xmin;
          const height = ymax - ymin;

          // Virtual crop container
          containerStyles += ` overflow: hidden; width: 100%; max-width: 600px; aspect-ratio: ${width}/${height}; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);`;

          // Image positioning to "zoom" into the crop area
          // Scale: 1000 / width * 100%
          const scaleX = (1000 / width) * 100;
          const scaleY = (1000 / height) * 100;

          // Position: -xmin% * scale
          // Actually simpler: 
          // object-fit: none (or cover with specific position?)
          // Standard CSS masking technique:
          // inner img width = (1000/width) * 100 % of container
          // margin-left = -(xmin/width) * 100 %

          imgStyles = `width: ${(1000 / width) * 100}%; max-width: none; height: ${(1000 / height) * 100}%; margin-top: -${(ymin / height) * 100}%; margin-left: -${(xmin / width) * 100}%; display: block;`;
        }
      }

      return `<div class="group" style="${containerStyles}">
         <img src="${displayUrl}" alt="${alt}" data-role="editable-image" style="${imgStyles}" />
         <button class="crop-btn absolute top-2 right-2 bg-black/70 hover:bg-black/90 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm z-10" title="Crop Image" data-src="${cleanSrc}">
           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/><path d="M22 6L2 22"/></svg>
         </button>
         ${!crop ? `<p style="font-size: 0.8em; color: gray; margin-top: 8px; font-style: italic;">${alt}</p>` : ''}
       </div>`;
    })
    // Paragraphs - Transform remaining text but ignore our specific placeholders if they happen to appear (unlikely but safe)
    .replace(/\n\n/g, '<div style="margin-bottom: 20px;"></div>')
    .replace(/^(?!<[hluibprt]|\u0000|<div)(.+)$/gm, (match) => { // Modified negative lookahead to include \u0000
      if (match.trim() && !match.startsWith('<') && !match.includes('\u0000_B_')) {
        return `<p style="margin-bottom: 16px; line-height: 1.7; color: ${darkStyles.textColor}; font-size: 1.05em;">${match}</p>`;
      }
      return match;
    });

  // 3. Unmasking Phase - Restore protected blocks
  blocks.forEach((content, i) => {
    html = html.replace(`\u0000_B_${i}_B_\u0000`, content);
  });

  return `<div class="enhanced-note-content" style="font-family: 'Inter', system-ui, sans-serif; line-height: 1.6; color: ${darkStyles.textColor};">${html}</div>`;
};

const MarkdownRenderer: React.FC<{
  content: string;
  isDarkMode: boolean;
  onCrop?: (src: string) => void;
}> = ({ content, isDarkMode, onCrop }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const html = React.useMemo(() => markdownToHtml(content, isDarkMode), [content, isDarkMode]);

  React.useEffect(() => {
    // Event delegation for crop buttons
    const handleCropClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.crop-btn');
      if (btn && onCrop) {
        const src = btn.getAttribute('data-src');
        if (src) onCrop(src);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('click', handleCropClick);
    }
    return () => {
      if (container) container.removeEventListener('click', handleCropClick);
    };
  }, [onCrop]);

  React.useEffect(() => {
    console.log('[MarkdownRenderer] Effect triggered');

    const renderDiagrams = async () => {
      try {
        if (!containerRef.current) {
          console.log('[MarkdownRenderer] Ref null, retry later?');
          return;
        }
        const elements = containerRef.current?.querySelectorAll('.mermaid');
        console.log(`[MarkdownRenderer] Found ${elements?.length || 0} mermaid elements`);

        if (!elements || elements.length === 0) return;

        mermaid.initialize({
          startOnLoad: false,
          theme: isDarkMode ? 'dark' : 'default',
          securityLevel: 'loose',
          logLevel: 'error',
          fontFamily: 'Arial, sans-serif'
        });

        const nodeList = Array.from(elements);
        for (const node of nodeList) {
          const el = node as HTMLElement;
          const id = el.id;
          console.log(`[MarkdownRenderer] Processing diagram ${id}`);

          // Check if already processed
          if (el.getAttribute('data-rendered') === 'true' || el.getAttribute('data-rendered') === 'error') {
            console.log(`[MarkdownRenderer] Skipping processed ${id}`);
            continue;
          }

          const code = el.textContent || '';
          const wrapper = el.parentElement; // .mermaid-wrapper
          const container = wrapper?.parentElement; // .mermaid-container
          const loading = container?.querySelector('.mermaid-loading') as HTMLElement;

          if (!code.trim()) {
            console.warn(`[MarkdownRenderer] Empty code for ${id}`);
            continue;
          }

          try {
            console.log(`[MarkdownRenderer] Parsing ${id}`);
            // Attempt 1: Parse check with timeout
            const parsePromise = mermaid.parse(code);
            const parseTimeoutProps = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Parse timeout")), 2000)
            );
            await Promise.race([parsePromise, parseTimeoutProps]);

            console.log(`[MarkdownRenderer] Rendering ${id}`);
            // Attempt 2: Render
            const svgId = `svg-${id.replace(/[^a-zA-Z0-9-_]/g, '')}`;
            const { svg } = await mermaid.render(svgId, code);

            if (wrapper) {
              wrapper.innerHTML = svg;
              el.setAttribute('data-rendered', 'true');
              if (loading) loading.style.display = 'none';
              console.log(`[MarkdownRenderer] Success ${id}`);
            }
          } catch (err) {
            console.error('[MarkdownRenderer] Failure:', id, err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown rendering error';

            if (wrapper) {
              wrapper.innerHTML = `
                <div class="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-left">
                  <p class="text-xs font-bold text-red-600 dark:text-red-400 mb-1">Diagram Rendering Failed</p>
                  <p class="text-[10px] text-red-500 font-mono whitespace-pre-wrap">${errorMessage}</p>
                  <pre class="mt-2 text-[10px] text-slate-500 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto">${code}</pre>
                </div>
              `;
              el.setAttribute('data-rendered', 'error');
              if (loading) loading.style.display = 'none';
            }
          }
        }
      } catch (globalErr) {
        console.error("[MarkdownRenderer] Global error:", globalErr);
      }
    };

    // Small delay to ensure DOM is painted and refs are populated
    const timer = setTimeout(() => {
      renderDiagrams();

      // --- Process SMILES Diagrams ---
      const smilesContainers = containerRef.current?.querySelectorAll('.smiles-wrapper');
      smilesContainers?.forEach(wrapper => {
        const el = wrapper as HTMLElement;
        const id = el.id;
        const smiles = el.getAttribute('data-smiles');
        const canvasId = `canvas-${id}`;

        if (!smiles) return;

        // Dynamic import
        import('smiles-drawer').then(SmilesDrawer => {
          try {
            const options = isDarkMode ? {
              bondThickness: 0.6,
              bondLength: 15,
              shortBondLength: 0.8,
              bondSpacing: 0.18,
              atomVisualization: 'default',
              isometric: true,
              debug: false,
              terminalCarbons: true,
              explicitHydrogens: true,
              overlapSensitivity: 0.42,
              overlapResolutionIterations: 1,
              compactDrawing: false,
              fontSizeLarge: 5,
              fontSizeSmall: 3,
              padding: 2,
              experimental: false,
              themes: {
                dark: {
                  C: '#fff',
                  O: '#e11d48',
                  N: '#3b82f6',
                  F: '#22c55e',
                  CL: '#16a34a',
                  BR: '#a855f7',
                  I: '#a855f7',
                  P: '#f97316',
                  S: '#eab308',
                  B: '#f59e0b',
                  SI: '#f59e0b',
                  H: '#fff',
                  BACKGROUND: 'transparent'
                }
              }
            } : {
              terminalCarbons: true,
              explicitHydrogens: true,
              themes: {
                light: {
                  C: '#222',
                  BACKGROUND: 'transparent'
                }
              }
            };

            const drawer = new SmilesDrawer.Drawer(options);

            SmilesDrawer.parse(smiles, (tree: any) => {
              drawer.draw(tree, canvasId, isDarkMode ? 'dark' : 'light', false);
            }, (err: any) => {
              console.error('SMILES Parse Error', err);
            });
          } catch (err) {
            console.error('SMILES Draw Error', err);
          }
        }).catch(err => console.error('Failed to load SmilesDrawer', err));
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [html, isDarkMode]);

  return <div
    ref={containerRef}
    className="prose prose-sm dark:prose-invert max-w-none"
    dangerouslySetInnerHTML={{ __html: html }}
    style={{ fontSize: '13px', lineHeight: '1.6' }}
  />;
};

// --- Crop Modal Component ---
const CropModal: React.FC<{
  imageSrc: string;
  onClose: () => void;
  onCropComplete: (croppedAreaPixels: any) => void;
}> = ({ imageSrc, onClose, onCropComplete }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-lg font-bold">Crop Image</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="relative h-[50vh] bg-slate-100 dark:bg-black/50">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={undefined} // Free crop
            onCropChange={setCrop}
            onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
            onZoomChange={setZoom}
          />
        </div>

        <div className="p-4 flex gap-4 items-center justify-end border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex-1">
            <label className="text-xs font-semibold mb-1 block">Zoom</label>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <button onClick={onClose} className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={() => onCropComplete(croppedAreaPixels)}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg shadow-indigo-100 dark:shadow-none"
          >
            Save Crop
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Presentation Mode Component ---
const PresentationView: React.FC<{
  content: string;
  onClose: () => void;
  isDarkMode: boolean;
}> = ({ content, onClose, isDarkMode }) => {
  // Dynamically import framer-motion to avoid heavy bundle if not used
  const [AnimatePresence, setAnimatePresence] = React.useState<any>(null);
  const [motion, setMotion] = React.useState<any>(null);
  const [currentSlide, setCurrentSlide] = React.useState(0);

  // Load framer-motion on mount
  React.useEffect(() => {
    import('framer-motion').then(mod => {
      // Handle both ES modules and CommonJS
      const AnimatePresenceComponent = mod.AnimatePresence;
      const motionComponent = mod.motion;

      if (AnimatePresenceComponent && motionComponent) {
        setAnimatePresence(() => AnimatePresenceComponent);
        setMotion(() => motionComponent);
      } else {
        console.error('Failed to load framer-motion components', mod);
      }
    }).catch(err => console.error('Failed to load framer-motion', err));
  }, []);

  // Split content into slides
  const slides = React.useMemo(() => {
    return content
      .split(/^---$/m) // Split by horizontal rule
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }, [content]);

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        setCurrentSlide(prev => Math.min(prev + 1, slides.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length, onClose]);

  if (!motion || !AnimatePresence) {
    return (
      <div className="fixed inset-0 z-[60] bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const SlideMotion = motion.div;

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            ✕ Close
          </button>
          <span className="text-sm font-mono text-slate-500">
            Slide {currentSlide + 1} / {slides.length}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentSlide(prev => Math.max(prev - 1, 0))}
            disabled={currentSlide === 0}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg disabled:opacity-50"
          >
            ← Prev
          </button>
          <button
            onClick={() => setCurrentSlide(prev => Math.min(prev + 1, slides.length - 1))}
            disabled={currentSlide === slides.length - 1}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Slide Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative p-8 md:p-16 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <SlideMotion
            key={currentSlide}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-4xl min-h-[50vh]"
          >
            <div className="prose prose-xl dark:prose-invert max-w-none slide-content">
              {/* Render current slide */}
              <MarkdownRenderer content={slides[currentSlide]} isDarkMode={isDarkMode} />
            </div>
          </SlideMotion>
        </AnimatePresence>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full bg-indigo-600 transition-all duration-300"
          style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
        />
      </div>
    </div>
  );
};


const TeacherNotes: React.FC<{
  teacher: Teacher | null;
  teacherId: string;
  adminId: string;
  classNames: { [key: string]: string };
  subjectNames: { [key: string]: string };
  classData: { [key: string]: Class };
  onDraftsCreated: (drafts: Assignment[]) => void;
}> = ({ teacher, teacherId, adminId, classNames, subjectNames, classData, onDraftsCreated }) => {
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [noteFiles, setNoteFiles] = useState<File[]>([]);
  const [noteBase64s, setNoteBase64s] = useState<string[]>([]);
  const [notePreviews, setNotePreviews] = useState<string[]>([]);
  const [notePrompt, setNotePrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<NoteAnalysisResult | null>(null);
  const [sections, setSections] = useState<NoteSectionDraft[]>([]);
  const [summary, setSummary] = useState('');
  const [isSavingDrafts, setIsSavingDrafts] = useState(false);
  const [enhancedNote, setEnhancedNote] = useState<string | null>(null);
  const [isGeneratingEnhancedNote, setIsGeneratingEnhancedNote] = useState(false);
  const [originalEnhancedNote, setOriginalEnhancedNote] = useState<string | null>(null);
  const [isSavingCorrections, setIsSavingCorrections] = useState(false);
  const [latestNote, setLatestNote] = useState<GeneratedNote | null>(null);
  const [noteHistory, setNoteHistory] = useState<GeneratedNote[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [correctionPrompt, setCorrectionPrompt] = useState('');
  const [correctionImages, setCorrectionImages] = useState<string[]>([]);
  const [isApplyingCorrection, setIsApplyingCorrection] = useState(false);
  const [croppingImageSrc, setCroppingImageSrc] = useState<string | null>(null);
  const [extractedPDFContent, setExtractedPDFContent] = useState<{ text: string; images: ExtractedImage[] } | null>(null);
  const [isExtractingPDF, setIsExtractingPDF] = useState(false);
  const [suggestedModuleTitle, setSuggestedModuleTitle] = useState('');
  const [moduleTitle, setModuleTitle] = useState('');
  const [allModuleNotes, setAllModuleNotes] = useState<GeneratedNote[]>([]);
  const [expandedModules, setExpandedModules] = useState<{ [key: string]: boolean }>({});
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [isPresenting, setIsPresenting] = useState(false);

  // Track dark mode changes
  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          setIsDarkMode(document.documentElement.classList.contains('dark'));
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Initialize Mermaid


  if (!teacher) return null;

  // Load latest note when subject/class changes
  useEffect(() => {
    const loadLatestNote = async () => {
      if (!selectedClassId || !selectedSubjectId) {
        setLatestNote(null);
        setAllModuleNotes([]);
        return;
      }
      try {
        const latest = await dbService.getLatestNote(adminId, selectedSubjectId, selectedClassId);
        setLatestNote(latest);

        // Load all module notes
        const allNotes = await dbService.getAllNotesForClassSubject(adminId, selectedSubjectId, selectedClassId);
        setAllModuleNotes(allNotes);
      } catch (err) {
        console.log('Could not load latest note:', err);
      }
    };
    loadLatestNote();
  }, [selectedClassId, selectedSubjectId, adminId]);

  const classOptions = Array.from(new Set([
    teacher.assignedClassId,
    ...teacher.assignedSubjects.map(s => s.classId)
  ].filter(Boolean))) as string[];

  const subjectOptionItems = (() => {
    const items = teacher.assignedSubjects.map(s => ({
      id: s.subjectId,
      label: subjectNames[s.subjectId] || s.subjectId
    }));

    if (teacher.primarySubject) {
      const exists = items.some(i => i.label === teacher.primarySubject || i.id === teacher.primarySubject);
      if (!exists) items.unshift({ id: teacher.primarySubject, label: teacher.primarySubject });
    }

    const seen = new Set<string>();
    return items.filter(i => {
      if (seen.has(i.label)) return false;
      seen.add(i.label);
      return true;
    });
  })();

  const handleNoteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNoteFiles(prev => [...prev, file]);
    setNotePreviews(prev => [...prev, URL.createObjectURL(file)]);
    const reader = new FileReader();
    reader.onloadend = () => setNoteBase64s(prev => [...prev, reader.result as string]);
    reader.readAsDataURL(file);
  };

  const handleCorrectionImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files) as File[];

      newFiles.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setCorrectionImages(prev => [...prev, reader.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleAnalyze = async () => {
    if (!selectedClassId || !selectedSubjectId || noteBase64s.length === 0) {
      alert('Please select class, subject, and upload a note.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const className = classNames[selectedClassId] || selectedClassId;
      const subjectName = subjectNames[selectedSubjectId] || selectedSubjectId;
      const result = await analyzeTeachingNote(noteBase64s, { subjectName, className }, notePrompt.trim() || undefined);
      setAnalysis(result);
      setSummary(result.noteSummary || '');
      setSections(result.sections || []);
    } catch (err: any) {
      alert('Failed to analyze note: ' + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateEnhancedNote = async () => {
    if (!selectedClassId || !selectedSubjectId || noteBase64s.length === 0) {
      alert('Please select class, subject, and upload a note.');
      return;
    }

    setIsGeneratingEnhancedNote(true);
    setIsExtractingPDF(true);

    try {
      const className = classNames[selectedClassId] || selectedClassId;
      const subjectName = subjectNames[selectedSubjectId] || selectedSubjectId;

      // Extract PDF content (text + images)
      let extractedText = '';
      // Updated to include raw imageData for AI context
      let pageImages: Array<{ pageNumber: number; url: string; imageData: string }> = [];

      try {
        const allExtractedContent = await Promise.all(
          noteBase64s.map(pdf => extractPDFContent(pdf, teacherId))
        );

        extractedText = allExtractedContent.map(c => c.text).join('\n\n');
        pageImages = allExtractedContent.flatMap(c =>
          c.images.map(img => ({ pageNumber: img.pageNumber, url: img.url, imageData: img.imageData }))
        );

        setExtractedPDFContent({
          text: extractedText,
          images: allExtractedContent.flatMap(c => c.images)
        });

        console.log(`Extracted ${pageImages.length} page images from PDF`);
      } catch (err) {
        console.error('PDF extraction failed:', err);
        // Continue without extraction if it fails
      }

      setIsExtractingPDF(false);

      // Fetch previous corrections to learn from them
      let previousCorrectionsText = '';
      try {
        const corrections = await dbService.getNoteCorrections(adminId, selectedSubjectId, selectedClassId, 3);
        if (corrections.length > 0) {
          previousCorrectionsText = corrections.map(c => `• ${c.correctionSummary}`).join('\n');
        }
      } catch (err) {
        console.log('Could not fetch previous corrections:', err);
      }

      const content = await createEnhancedNote(
        noteBase64s,
        { subjectName, className },
        notePrompt.trim() || undefined,
        previousCorrectionsText || undefined,
        extractedText || undefined,
        pageImages.length > 0 ? pageImages : undefined
      );

      // Replace [IMAGE:page_X] markers with actual URLs
      let processedContent = content;

      console.log('Available page images:', pageImages.map(p => p.pageNumber));
      console.log('Note content length:', content.length);

      // Use a single comprehensive regex that captures any format
      pageImages.forEach(img => {
        // Updated regex to catch loose formats: [IMAGE:Page X | coords], IMAGE:Page X | coords, with spaces
        // Optional brackets, allowed spaces around pipe and numbers
        const regex = new RegExp(`\\[?IMAGE:page[_\\s]?${img.pageNumber}(?:\\s*\\|\\s*([\\d,\\s]+))?\\]?`, 'gi');

        // Replacement function to handle the captured coords
        processedContent = processedContent.replace(regex, (match, coords) => {
          // If coords exist, append as query param for the frontend renderer to pick up
          const url = coords ? `${img.url}?crop=${coords.replace(/\s/g, '')}` : img.url;
          return `![Page ${img.pageNumber} diagram](${url})`;
        });
      });

      setEnhancedNote(processedContent);
      setOriginalEnhancedNote(processedContent);

      // Extract module title from note content
      try {
        const extractedTitle = await extractModuleTitle(processedContent);
        setSuggestedModuleTitle(extractedTitle);
        setModuleTitle(extractedTitle);
      } catch (err) {
        console.error('Could not extract module title:', err);
        setSuggestedModuleTitle('');
        setModuleTitle('');
      }

      // Don't auto-save yet - let teacher confirm/edit the title first

    } catch (err: any) {
      alert('Failed to generate note: ' + err.message);
    } finally {
      setIsGeneratingEnhancedNote(false);
      setIsExtractingPDF(false);
    }
  };

  const handleSaveNoteWithTitle = async () => {
    if (!enhancedNote || !moduleTitle.trim()) {
      alert('Please provide a module title before saving.');
      return;
    }

    setIsSavingCorrections(true);
    try {
      const saved = await dbService.saveGeneratedNote(adminId, {
        teacherId,
        subjectId: selectedSubjectId,
        classId: selectedClassId,
        className: classNames[selectedClassId] || selectedClassId,
        subjectName: subjectNames[selectedSubjectId] || selectedSubjectId,
        content: enhancedNote,
        summary: summary || 'No summary available',
        moduleTitle: moduleTitle.trim(),
        isLatest: true,
        groupId: editingGroupId || undefined
      });

      // Reload all module notes
      const allNotes = await dbService.getAllNotesForClassSubject(adminId, selectedSubjectId, selectedClassId);
      setAllModuleNotes(allNotes);
      const latest = await dbService.getLatestNote(adminId, selectedSubjectId, selectedClassId);
      setLatestNote(latest);

      alert('Note saved successfully!');

      // Reset form
      setEnhancedNote(null);
      setOriginalEnhancedNote(null);
      setModuleTitle('');
      setSuggestedModuleTitle('');

    } catch (err: any) {
      alert('Failed to save note: ' + err.message);
    } finally {
      setIsSavingCorrections(false);
    }
  };




  const downloadAsPDF = async () => {
    if (!enhancedNote) return;

    // Dynamically import html2pdf when needed
    const html2pdf = (await import('html2pdf.js')).default;

    const element = document.createElement('div');
    element.innerHTML = markdownToHtml(enhancedNote);

    const opt: any = {
      margin: 10,
      filename: `${subjectNames[selectedSubjectId] || 'note'}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };

    html2pdf().set(opt).from(element).save();
  };

  const handleLoadHistory = async () => {
    if (!selectedClassId || !selectedSubjectId) return;
    setIsLoadingHistory(true);
    try {
      const history = await dbService.getNoteHistory(adminId, selectedSubjectId, selectedClassId, 10);
      setNoteHistory(history);
      setShowHistory(true);
    } catch (err) {
      alert('Failed to load note history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Formatting helper for the editor
  const insertMarkdown = (before: string, after: string = '', placeholder: string = 'text') => {
    const textarea = document.querySelector('textarea[placeholder="Edit the note content here..."]') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = enhancedNote.substring(start, end) || placeholder;
    const newContent =
      enhancedNote.substring(0, start) +
      before + selected + after +
      enhancedNote.substring(end);

    setEnhancedNote(newContent);

    // Move cursor to after inserted text
    setTimeout(() => {
      textarea.focus();
      const newPos = start + before.length + selected.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleApplyCorrection = async () => {
    if (!enhancedNote || !correctionPrompt.trim()) return;

    setIsApplyingCorrection(true);
    try {
      // 1. Upload correction images to get public URLs
      const imageUrls: string[] = [];
      if (correctionImages.length > 0) {
        try {
          const uploads = await Promise.all(correctionImages.map((img, idx) =>
            uploadBase64ToStorage(img, teacherId, `correction_${Date.now()}_${idx}`)
          ));
          imageUrls.push(...uploads);
        } catch (uploadErr) {
          console.error("Failed to upload correction images", uploadErr);
          // Proceed without images if upload fails? Or warn?
          // For now proceed, but AI won't link them properly.
        }
      }

      const newContent = await applyNoteCorrection(enhancedNote, correctionPrompt, correctionImages, imageUrls);

      const summary = await extractCorrectionSummary(enhancedNote, newContent);

      // Save the correction
      const correction: NoteCorrection = {
        id: crypto.randomUUID(),
        originalContent: enhancedNote,
        correctedContent: newContent,
        correctionPrompt,
        correctionSummary: summary,
        timestamp: Date.now(),
        teacherId
      };

      // Update DB
      await dbService.saveNoteCorrection(adminId, selectedSubjectId, selectedClassId, correction);

      setEnhancedNote(newContent);
      setCorrectionPrompt('');
      setCorrectionImages([]); // Clear images after application
      alert('✅ Correction applied! Review the changes below.');
    } catch (err: any) {
      alert('Failed to apply correction: ' + err.message);
    } finally {
      setIsApplyingCorrection(false);
    }
  };

  const handleCropClick = (src: string) => {
    setCroppingImageSrc(src);
  };

  const handleCropComplete = async (croppedAreaPixels: any) => {
    if (!croppingImageSrc || !croppedAreaPixels) return;
    try {
      const croppedBlob = await getCroppedImg(croppingImageSrc, croppedAreaPixels);
      if (!croppedBlob) throw new Error("Failed to crop image");

      // Convert blob to base64 for upload
      const reader = new FileReader();
      reader.readAsDataURL(croppedBlob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;

        // Upload
        const newUrl = await uploadBase64ToStorage(base64data, teacherId, `cropped_${Date.now()}`);

        // Update content
        // We need to replace the specific instance of the image URL in the markdown
        // The URL might be used multiple times, but standard behavior is to update all or just this one.
        // Since we don't have a unique ID for each image instance easily, replacing by URL is safest.
        if (enhancedNote) {
          // Replace the old URL with the new URL
          // Escape special chars in old URL for regex
          const oldUrlRegex = new RegExp(croppingImageSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          const updatedNote = enhancedNote.replace(oldUrlRegex, newUrl);
          setEnhancedNote(updatedNote);
          if (originalEnhancedNote === enhancedNote) {
            setOriginalEnhancedNote(updatedNote); // Keep synced if it was original
          }
        }

        setCroppingImageSrc(null);
      };
    } catch (err) {
      console.error("Crop failed", err);
      alert("Failed to save cropped image");
    }
  };

  const handleSaveWithLearning = async () => {
    if (!enhancedNote || !originalEnhancedNote || !selectedSubjectId || !selectedClassId) return;

    // Check if there are actual changes
    if (enhancedNote === originalEnhancedNote) {
      alert('No changes detected. Note remains the same.');
      return;
    }

    setIsSavingCorrections(true);
    try {
      // Extract a summary of corrections using AI
      const correctionSummary = await extractCorrectionSummary(originalEnhancedNote, enhancedNote);

      // Save the correction to Firestore for future learning
      // Save the correction to Firestore for future learning
      // For manual edits, we treat the prompt as "Manual Enhancement"
      const correction: NoteCorrection = {
        id: crypto.randomUUID(),
        originalContent: originalEnhancedNote,
        correctedContent: enhancedNote,
        correctionPrompt: "Manual Enhancement via Editor",
        correctionSummary,
        timestamp: Date.now(),
        teacherId
      };

      await dbService.saveNoteCorrection(adminId, selectedSubjectId, selectedClassId, correction);

      // Save the corrected note as the latest version
      await dbService.saveGeneratedNote(adminId, {
        teacherId,
        subjectId: selectedSubjectId,
        classId: selectedClassId,
        className: classNames[selectedClassId] || selectedClassId,
        subjectName: subjectNames[selectedSubjectId] || selectedSubjectId,
        content: enhancedNote,
        summary: summary || 'Updated note',
        moduleTitle: moduleTitle || suggestedModuleTitle || 'Updated Note',
        isLatest: true
      });

      alert('✅ Corrections saved! AI will learn from your feedback on future notes.');
      setEnhancedNote(null);
      setOriginalEnhancedNote(null);

      // Reload latest note and all modules
      const latest = await dbService.getLatestNote(adminId, selectedSubjectId, selectedClassId);
      setLatestNote(latest);
      const allNotes = await dbService.getAllNotesForClassSubject(adminId, selectedSubjectId, selectedClassId);
      setAllModuleNotes(allNotes);
    } catch (err: any) {
      alert('Failed to save corrections: ' + err.message);
    } finally {
      setIsSavingCorrections(false);
    }
  };

  const handleCreateDrafts = async () => {
    if (!selectedClassId || !selectedSubjectId || sections.length === 0) return;
    setIsSavingDrafts(true);
    try {
      const gradeId = classData[selectedClassId]?.gradeId || 'unknown';
      const drafts: Assignment[] = sections.map((section, idx) => ({
        id: `${Date.now()}_${idx}`,
        title: section.title,
        question: section.question,
        markingPoints: section.markingPoints,
        createdAt: Date.now() + idx,
        gradeId,
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        teacherId,
        status: 'DRAFT'
      }));

      await Promise.all(drafts.map(d => dbService.saveAssignment(adminId, d)));
      onDraftsCreated(drafts);
      alert('Draft assignments created!');
    } catch (err: any) {
      alert('Failed to create drafts: ' + err.message);
    } finally {
      setIsSavingDrafts(false);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
      <div>
        <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Notes</h2>
        <p className="text-slate-500 font-medium">Upload your teaching notes to generate draft assignments by section.</p>
      </div>

      {/* All Module Notes - Collapsible */}
      {allModuleNotes.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white">📚 All Module Notes</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {allModuleNotes.length} module{allModuleNotes.length !== 1 ? 's' : ''} for {classNames[selectedClassId]} - {subjectNames[selectedSubjectId]}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {allModuleNotes.map((note) => {
              const isExpanded = expandedModules[note.id];

              return (
                <div key={note.id} className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                  <div className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <button
                      onClick={() => setExpandedModules(prev => ({ ...prev, [note.id]: !prev[note.id] }))}
                      className="flex-1 flex items-center gap-4 text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                        <span className="text-xl">📖</span>
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-slate-800 dark:text-white">{note.moduleTitle}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Updated {new Date(note.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEnhancedNote(note.content);
                          setOriginalEnhancedNote(note.content);
                          setModuleTitle(note.moduleTitle);
                          setSuggestedModuleTitle(note.moduleTitle);
                          setEditingGroupId(note.groupId || note.id);
                          setTimeout(() => {
                            document.getElementById('enhanced-note-editor')?.scrollIntoView({ behavior: 'smooth' });
                          }, 100);
                        }}
                        className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEnhancedNote(note.content);
                          setOriginalEnhancedNote(note.content); // Needed for correct displaying
                          setModuleTitle(note.moduleTitle);
                          setIsPresenting(true);
                        }}
                        className="px-3 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-xs font-bold transition-all"
                        title="Present Note"
                      >
                        📽️
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
                            try {
                              await dbService.deleteGeneratedNote(adminId, note.id, note.groupId);
                              setAllModuleNotes(prev => prev.filter(n => n.id !== note.id));
                              // Also clear if it's the currently viewed latest note
                              if (latestNote?.id === note.id) {
                                setLatestNote(null);
                              }
                            } catch (err) {
                              alert('Failed to delete note');
                            }
                          }
                        }}
                        className="px-3 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 text-xs font-bold transition-all"
                        title="Delete Note"
                      >
                        🗑️
                      </button>
                      <button
                        onClick={() => setExpandedModules(prev => ({ ...prev, [note.id]: !prev[note.id] }))}
                        className="text-2xl transition-transform"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >
                        ⌄
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                      <MarkdownRenderer content={note.content} isDarkMode={isDarkMode} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {latestNote && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-[2rem] p-8 border border-blue-200 dark:border-blue-700/50 shadow-sm space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-black text-blue-900 dark:text-blue-200 flex items-center gap-2">
                ⭐ Latest Note Version
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Last updated: {new Date(latestNote.updatedAt).toLocaleDateString()} at {new Date(latestNote.updatedAt).toLocaleTimeString()}
              </p>
            </div>
            <button
              onClick={handleLoadHistory}
              disabled={isLoadingHistory}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all disabled:opacity-50"
            >
              {isLoadingHistory ? 'Loading...' : '📜 View History'}
            </button>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-h-[300px] overflow-y-auto border border-blue-100 dark:border-blue-700/30">
            <MarkdownRenderer content={latestNote.content} isDarkMode={isDarkMode} />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                if (latestNote) {
                  setEnhancedNote(latestNote.content);
                  setOriginalEnhancedNote(latestNote.content);
                  setEditingGroupId(latestNote.groupId || latestNote.id);
                  // Scroll to editing section
                  setTimeout(() => {
                    document.getElementById('enhanced-note-editor')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all"
            >
              ✏️ Edit This Note
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Class</label>
            <select className="input-style" value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}>
              <option value="">Select Class</option>
              {classOptions.map(id => (
                <option key={id} value={id}>{classNames[id] || id}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Subject</label>
            <select className="input-style" value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)}>
              <option value="">Select Subject</option>
              {subjectOptionItems.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Upload Note (PDF)</label>
          <div className="flex flex-wrap gap-3">
            {noteFiles.map((f, idx) => (
              <div key={idx} className="px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/60 text-sm font-bold flex items-center gap-3">
                <button
                  className="text-indigo-600"
                  onClick={() => window.open(notePreviews[idx], '_blank')}
                  title="Preview"
                >
                  📄
                </button>
                <span className="max-w-[200px] truncate">{f.name}</span>
                <button
                  onClick={() => {
                    setNoteFiles(noteFiles.filter((_, i) => i !== idx));
                    setNoteBase64s(noteBase64s.filter((_, i) => i !== idx));
                    setNotePreviews(notePreviews.filter((_, i) => i !== idx));
                  }}
                  className="text-slate-400 hover:text-red-500"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
            <label className="px-4 py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/60">
              <input type="file" accept="application/pdf" onChange={handleNoteChange} className="hidden" />
              <span className="text-sm font-bold text-slate-500">+ Add PDF</span>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">AI Prompt (Optional)</label>
          <textarea
            className="input-style h-24"
            placeholder="Add guidance for the AI, e.g. focus on problem-solving steps, include 5 criteria per section..."
            value={notePrompt}
            onChange={e => setNotePrompt(e.target.value)}
          />
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-lg shadow-indigo-100 dark:shadow-none transition-all active:scale-95 disabled:opacity-50"
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze with AI'}
          </button>
          <button
            onClick={handleGenerateEnhancedNote}
            disabled={isGeneratingEnhancedNote || isExtractingPDF}
            className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-lg shadow-emerald-100 dark:shadow-none transition-all active:scale-95 disabled:opacity-50"
          >
            {isExtractingPDF ? '📄 Extracting PDF...' : isGeneratingEnhancedNote ? '🤖 Generating...' : '✨ Create Enhanced Note'}
          </button>
          <button
            onClick={() => {
              setAnalysis(null);
              setSections([]);
              setSummary('');
              setEnhancedNote(null);
              setNotePrompt('');
              setEditingGroupId(null);
            }}
            className="px-6 py-3 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition-all"
          >
            Clear Review
          </button>
        </div>
      </div>

      {analysis && (
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-black">Teacher Review Notes</h3>
            <textarea
              className="input-style h-32"
              value={summary}
              onChange={e => setSummary(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            <h4 className="text-lg font-black">Draft Assignments by Section</h4>
            {sections.map((section, idx) => (
              <div key={idx} className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/60 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Title</label>
                    <input
                      className="input-style"
                      value={section.title}
                      onChange={e => {
                        const updated = [...sections];
                        updated[idx] = { ...updated[idx], title: e.target.value };
                        setSections(updated);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Marking Points</label>
                    <div className="text-xs text-slate-500">{section.markingPoints.length} criteria</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Question</label>
                  <textarea
                    className="input-style h-28"
                    value={section.question}
                    onChange={e => {
                      const updated = [...sections];
                      updated[idx] = { ...updated[idx], question: e.target.value };
                      setSections(updated);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  {section.markingPoints.map((mp, mpIdx) => (
                    <div key={mpIdx} className="flex gap-2 items-center">
                      <input
                        className="input-style"
                        value={mp.point}
                        onChange={e => {
                          const updated = [...sections];
                          const updatedPoints = [...updated[idx].markingPoints];
                          updatedPoints[mpIdx] = { ...updatedPoints[mpIdx], point: e.target.value };
                          updated[idx] = { ...updated[idx], markingPoints: updatedPoints };
                          setSections(updated);
                        }}
                      />
                      <input
                        type="number"
                        className="w-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 font-black text-center focus:ring-1 focus:ring-indigo-500"
                        value={mp.weight}
                        onChange={e => {
                          const updated = [...sections];
                          const updatedPoints = [...updated[idx].markingPoints];
                          updatedPoints[mpIdx] = { ...updatedPoints[mpIdx], weight: parseInt(e.target.value) || 0 };
                          updated[idx] = { ...updated[idx], markingPoints: updatedPoints };
                          setSections(updated);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleCreateDrafts}
              disabled={isSavingDrafts}
              className="px-6 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-xl shadow-indigo-100 dark:shadow-none transition-all active:scale-95 disabled:opacity-50"
            >
              {isSavingDrafts ? 'Creating Drafts...' : 'Create Draft Assignments'}
            </button>
            <button
              onClick={() => {
                setAnalysis(null);
                setSections([]);
                setSummary('');
                setNotePrompt('');
              }}
              className="px-6 py-4 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition-all"
            >
              Reset Review
            </button>
          </div>
        </div>
      )}

      {enhancedNote && (
        <div id="enhanced-note-editor" className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-black">📖 Enhanced Study Note</h3>
              <p className="text-sm text-slate-500 mt-1">Review and edit. Changes will help AI improve future notes.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setIsPresenting(true)}
                className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-lg shadow-indigo-100 dark:shadow-none transition-all active:scale-95"
                title="Start Presentation"
              >
                📽️ Present
              </button>
              <button
                onClick={downloadAsPDF}
                className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black shadow-lg shadow-blue-100 dark:shadow-none transition-all active:scale-95"
                title="Download as PDF"
              >
                📥 Download PDF
              </button>
            </div>
          </div>

          {/* Module Title Input */}
          {suggestedModuleTitle && (
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl p-6 border-2 border-purple-200 dark:border-purple-700/50 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🏷️</span>
                <h4 className="text-lg font-black text-purple-900 dark:text-purple-200">Module Title</h4>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-300 tracking-widest ml-1">
                  AI-Suggested Title (You can edit)
                </label>
                <input
                  type="text"
                  value={moduleTitle}
                  onChange={e => setModuleTitle(e.target.value)}
                  placeholder="e.g., Module 1: Introduction to Physics"
                  className="input-style"
                />
                <p className="text-xs text-purple-700 dark:text-purple-300 font-medium">
                  💡 AI suggested: "{suggestedModuleTitle}"
                </p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {enhancedNote !== originalEnhancedNote && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-700/50 rounded-xl p-4">
                <p className="text-sm text-amber-800 dark:text-amber-200 font-bold">✏️ You have made changes. Save with learning to help improve future notes.</p>
              </div>
            )}

            <MarkdownRenderer content={enhancedNote} isDarkMode={isDarkMode} onCrop={handleCropClick} />
          </div>

          {/* AI-Powered Correction Prompt */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 border-2 border-blue-200 dark:border-blue-700/50 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">🤖</span>
              <h4 className="text-lg font-black text-blue-900 dark:text-blue-200">AI-Powered Corrections</h4>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-blue-700 dark:text-blue-300 tracking-widest ml-1">
                Give AI a specific instruction
              </label>
              <textarea
                value={correctionPrompt}
                onChange={e => setCorrectionPrompt(e.target.value)}
                placeholder="Examples:
• Add a summary table comparing the three types
• Modify the photosynthesis section with more real-world examples
• Add a practice questions section at the end with 5 questions
• Insert a detailed explanation of stomata under the key concepts section"
                className="input-style h-28"
              />
            </div>

            <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
              💡 Be specific! Tell AI what to add, modify, or remove and where to place it.
            </p>

            {/* Correction Images Preview */}
            <div className="flex gap-2 mb-4 overflow-x-auto">
              {correctionImages.map((img, idx) => (
                <div key={idx} className="relative group flex-shrink-0">
                  <img src={img} alt={`Correction context ${idx}`} className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                  <button
                    onClick={() => setCorrectionImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove image"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 items-center">
              <label className="cursor-pointer p-3 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleCorrectionImageUpload}
                />
                <ImageIcon size={20} />
              </label>
              <button
                onClick={handleApplyCorrection}
                disabled={isApplyingCorrection || (!correctionPrompt.trim() && correctionImages.length === 0)}
                className="flex-1 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black shadow-lg shadow-blue-100 dark:shadow-none transition-all active:scale-95 disabled:opacity-50"
              >
                {isApplyingCorrection ? '⏳ Applying Correction...' : '✨ Apply Correction'}
              </button>
            </div>
          </div>



          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleSaveNoteWithTitle}
              disabled={isSavingCorrections || !moduleTitle.trim()}
              className="px-6 py-3 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-black shadow-lg shadow-green-100 dark:shadow-none transition-all active:scale-95 disabled:opacity-50"
              title="Save note with module title"
            >
              {isSavingCorrections ? 'Saving...' : '💾 Save Note'}
            </button>
            <button
              onClick={handleSaveWithLearning}
              disabled={isSavingCorrections || enhancedNote === originalEnhancedNote || !moduleTitle.trim()}
              className="px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black shadow-lg shadow-purple-100 dark:shadow-none transition-all active:scale-95 disabled:opacity-50"
              title="Save corrections and learn from them"
            >
              {isSavingCorrections ? 'Learning...' : '🧠 Save & Learn'}
            </button>
            <button
              onClick={downloadAsPDF}
              className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black shadow-lg shadow-blue-100 dark:shadow-none transition-all active:scale-95"
              title="Download as PDF"
            >
              📥 Download PDF
            </button>
            <button
              onClick={() => {
                setEnhancedNote(null);
                setOriginalEnhancedNote(null);
                setModuleTitle('');
                setSuggestedModuleTitle('');
              }}
              className="px-6 py-3 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition-all"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-2xl font-black">📜 Note History</h3>
            <button
              onClick={() => setShowHistory(false)}
              className="text-2xl font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              ✕
            </button>
          </div>

          {noteHistory.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg">No previous notes found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {noteHistory.map((note, idx) => (
                <div
                  key={note.id}
                  className={`p-6 rounded-2xl border-2 transition-all cursor-pointer ${note.isLatest
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                    : 'bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  onClick={() => {
                    setEnhancedNote(note.content);
                    setOriginalEnhancedNote(note.content);
                    setShowHistory(false);
                    setTimeout(() => {
                      document.getElementById('enhanced-note-editor')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {note.isLatest ? '⭐ Latest - ' : ''}{new Date(note.updatedAt).toLocaleDateString()} {new Date(note.updatedAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <span className="text-xs font-black uppercase bg-slate-200 dark:bg-slate-600 px-3 py-1 rounded-lg">
                      {idx === 0 ? 'Current' : `v${noteHistory.length - idx}`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{note.content.substring(0, 150)}...</p>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowHistory(false)}
            className="w-full px-6 py-3 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition-all"
          >
            Close History
          </button>
        </div>
      )}
      {/* Presentation Mode Overlay */}
      {/* Image Crop Modal */}
      {croppingImageSrc && (
        <CropModal
          imageSrc={croppingImageSrc}
          onClose={() => setCroppingImageSrc(null)}
          onCropComplete={handleCropComplete}
        />
      )}

      {isPresenting && enhancedNote && (
        <PresentationView
          content={enhancedNote}
          onClose={() => setIsPresenting(false)}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
};

const TeacherGradebook: React.FC<{
  assignments: Assignment[];
  submissions: Submission[];
  classNames: { [key: string]: string };
  subjectNames: { [key: string]: string };
  adminId: string;
  onRefresh?: () => Promise<void>;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
  onUpdateSubmission?: (sub: Submission) => void;
}> = ({ assignments, submissions, classNames, subjectNames, adminId, onRefresh, onSuccess, onError, onUpdateSubmission }) => {
  const [expandedAssignments, setExpandedAssignments] = useState<{ [id: string]: boolean }>({});
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [editingSubmission, setEditingSubmission] = useState<Submission | null>(null); // New editing state

  // Annotation Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number, y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [annotationFormPos, setAnnotationFormPos] = useState<{ x: number, y: number } | null>(null);
  const [tempBox, setTempBox] = useState<number[] | null>(null); // [ymin, xmin, ymax, xmax] 0-1000 scale

  const toggleAssignment = (assignmentId: string) => {
    setExpandedAssignments(prev => ({ ...prev, [assignmentId]: !prev[assignmentId] }));
    const selected = submissions.find(s => s.id === selectedSubmissionId);
    if (selected?.assignmentId === assignmentId && expandedAssignments[assignmentId]) {
      setSelectedSubmissionId(null);
    }
  };

  const sortedAssignments = assignments
    .filter(a => a.status === 'PUBLISHED')
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
      <div>
        <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Gradebook</h2>
        <p className="text-slate-500 font-medium">View submissions assignment-wise and review individual student results.</p>
      </div>

      {sortedAssignments.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-12 text-center border border-slate-200 dark:border-slate-700">
          <div className="text-5xl mb-4">📘</div>
          <p className="text-slate-500">No assignments found yet.</p>
        </div>
      )}

      <div className="space-y-4">
        {sortedAssignments.map(assignment => {
          const assignmentSubmissions = submissions.filter(s => s.assignmentId === assignment.id);
          const isExpanded = !!expandedAssignments[assignment.id];
          const selectedSubmission = assignmentSubmissions.find(s => s.id === selectedSubmissionId) || null;

          return (
            <div key={assignment.id} className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm">
              <button
                onClick={() => toggleAssignment(assignment.id)}
                className="w-full text-left p-6 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-[2rem] transition-colors"
              >
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-slate-800 dark:text-white">{assignment.title}</h3>
                  <div className="text-xs font-bold text-slate-500 flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg">
                      Class {classNames[assignment.classId] || assignment.classId}
                    </span>
                    <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg">
                      {subjectNames[assignment.subjectId] || assignment.subjectId}
                    </span>
                    <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg">
                      {assignmentSubmissions.length} Submissions
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-400">
                  <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
                  <span className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>⌄</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 dark:border-slate-700 p-6 space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-3">
                      <h4 className="text-sm font-black uppercase tracking-widest text-slate-400">Submitted Students</h4>
                      {assignmentSubmissions.length === 0 && (
                        <div className="text-sm text-slate-400 italic">No submissions yet.</div>
                      )}
                      <div className="space-y-2">
                        {assignmentSubmissions.map(sub => (
                          <button
                            key={sub.id}
                            onClick={() => setSelectedSubmissionId(sub.id)}
                            className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${selectedSubmissionId === sub.id
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                              : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 bg-white/50 dark:bg-slate-800'
                              }`}
                          >
                            <div className="font-bold">{sub.studentName || sub.studentId}</div>
                            <div className="text-[10px] uppercase tracking-widest text-slate-400">
                              {sub.score ?? 0}/{sub.maxScore ?? 0}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      {!selectedSubmission && (
                        <div className="h-full flex items-center justify-center text-slate-400 italic border border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-10">
                          Select a student to view submission details.
                        </div>
                      )}

                      {selectedSubmission && (
                        <div className="space-y-6">
                          <div className="lg:col-span-2 bg-slate-50 dark:bg-slate-900/50 rounded-3xl p-8 border border-slate-200 dark:border-slate-800">
                            <div className="flex justify-between items-start mb-6">
                              <div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white">{selectedSubmission.studentName}</h3>
                                <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">
                                  {new Date(selectedSubmission.gradedAt || 0).toLocaleString()}
                                  {assignment.dueDate && (
                                    (() => {
                                      const graded = selectedSubmission.gradedAt || 0;
                                      const diff = assignment.dueDate - graded;
                                      const absK = Math.abs(diff);
                                      const days = Math.floor(absK / 86400000);
                                      const hours = Math.floor((absK % 86400000) / 3600000);
                                      const mins = Math.floor((absK % 3600000) / 60000);

                                      let str = "";
                                      if (days > 0) str += `${days}d `;
                                      if (hours > 0) str += `${hours}h `;
                                      str += `${mins}m `;

                                      if (diff < 0) return <span className="ml-2 text-red-500 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded">{str} late</span>;
                                      return <span className="ml-2 text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded">{str} early</span>;
                                    })()
                                  )}
                                </p>
                              </div>
                              <div className="text-right flex flex-col items-end gap-2">
                                <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                                  {editingSubmission && editingSubmission.id === selectedSubmission.id
                                    ? editingSubmission.score
                                    : selectedSubmission.score ?? 0}
                                  /{selectedSubmission.maxScore ?? 0}
                                </div>

                                {/* Edit Controls */}
                                {editingSubmission && editingSubmission.id === selectedSubmission.id ? (
                                  <div className="flex gap-2 animate-in zoom-in">
                                    <button
                                      onClick={async () => {
                                        if (!editingSubmission) return;

                                        // Validation: Require duplicate Check or Manual Annotation
                                        // "teacher must make an annotation to save edits"
                                        const hasManualAnnotation = editingSubmission.annotations?.some(a => a.isManual);
                                        if (!hasManualAnnotation) {
                                          if (onError) onError("Please add an annotation (click on image) to verify your changes.");
                                          else alert("Please add an annotation (click on image) to verify your changes.");
                                          return;
                                        }

                                        // Save Logic
                                        const prevEdited = selectedSubmission.editedCriteria || [];
                                        const numCriteria = assignment.markingPoints.length;
                                        // Ensure full length and no holes (Firestore rejects undefined/sparse)
                                        const newEditedIndices = Array(numCriteria).fill(false).map((_, i) => prevEdited[i] ?? false);

                                        // Mark newly changed criteria
                                        if (editingSubmission.criteriaScores) {
                                          assignment.markingPoints.forEach((_, idx) => {
                                            const oldVal = selectedSubmission.criteriaScores?.[idx];
                                            const newVal = editingSubmission.criteriaScores?.[idx];
                                            if (oldVal !== newVal) {
                                              newEditedIndices[idx] = true;
                                            }
                                          });
                                        }

                                        const finalSub = {
                                          ...editingSubmission,
                                          isEdited: true,
                                          editedCriteria: newEditedIndices
                                        };
                                        try {
                                          await dbService.saveSubmission(adminId, finalSub);

                                          // Optimistic Update
                                          if (onUpdateSubmission) {
                                            onUpdateSubmission(finalSub);
                                          }

                                          // Show success immediately
                                          if (onSuccess) onSuccess("Grade updated successfully!");

                                          // Close edit mode
                                          setEditingSubmission(null);

                                          // Refresh in background
                                          if (onRefresh) {
                                            onRefresh().catch(console.error);
                                          }
                                        } catch (e: any) {
                                          if (onError) onError("Failed to save grade: " + e.message);
                                          else alert("Failed to save grade: " + e.message);
                                          console.error(e);
                                        }
                                      }}
                                      className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-green-200 dark:shadow-none"
                                    >
                                      Save Changes
                                    </button>
                                    <button
                                      onClick={() => setEditingSubmission(null)}
                                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl font-bold text-xs"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setEditingSubmission(selectedSubmission)}
                                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl font-bold text-xs transition-colors"
                                  >
                                    Edit Grade ✏️
                                  </button>
                                )}

                                {selectedSubmission.isEdited && !editingSubmission && (
                                  <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">Edited</span>
                                )}
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Score</p>
                              </div>
                            </div>
                            {selectedSubmission.studentAnswerImages && selectedSubmission.studentAnswerImages.length > 0 ? (
                              <div className="mt-6">
                                <h5 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-3">Student Answer with AI Marks</h5>
                                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black relative inline-block w-full">
                                  <div
                                    className="relative w-full h-auto group cursor-crosshair touch-none"
                                    onMouseDown={(e) => {
                                      if (!editingSubmission || editingSubmission.id !== selectedSubmission.id) return;
                                      e.preventDefault();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const x = e.clientX - rect.left;
                                      const y = e.clientY - rect.top;
                                      setIsDrawing(true);
                                      setDrawStart({ x, y });
                                      setCurrentRect({ x, y, w: 0, h: 0 });
                                      setShowAnnotationForm(false);
                                    }}
                                    onMouseMove={(e) => {
                                      if (!isDrawing || !drawStart) return;
                                      e.preventDefault();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const x = e.clientX - rect.left;
                                      const y = e.clientY - rect.top;

                                      const w = x - drawStart.x;
                                      const h = y - drawStart.y;

                                      setCurrentRect({
                                        x: w > 0 ? drawStart.x : x,
                                        y: h > 0 ? drawStart.y : y,
                                        w: Math.abs(w),
                                        h: Math.abs(h)
                                      });
                                    }}
                                    onMouseUp={(e) => {
                                      if (!isDrawing || !drawStart || !currentRect) return;
                                      setIsDrawing(false);

                                      // Min size check (to avoid accidental dots)
                                      if (currentRect.w < 10 || currentRect.h < 10) {
                                        setCurrentRect(null);
                                        setDrawStart(null);
                                        return;
                                      }

                                      const rect = e.currentTarget.getBoundingClientRect();

                                      // Convert to 0-1000 scale [ymin, xmin, ymax, xmax]
                                      const scaleX = 1000 / rect.width;
                                      const scaleY = 1000 / rect.height;

                                      // box_2d: [ymin, xmin, ymax, xmax]
                                      const box = [
                                        currentRect.y * scaleY,
                                        currentRect.x * scaleX,
                                        (currentRect.y + currentRect.h) * scaleY,
                                        (currentRect.x + currentRect.w) * scaleX
                                      ];

                                      setTempBox(box);
                                      setAnnotationFormPos({
                                        x: currentRect.x + currentRect.w + 10,
                                        y: currentRect.y
                                      });
                                      setShowAnnotationForm(true);
                                    }}
                                  >
                                    <img
                                      src={selectedSubmission.studentAnswerImages[0]}
                                      alt="Student Answer"
                                      className="w-full h-auto max-h-[600px] object-contain mx-auto"
                                    />
                                    {/* AI Annotations */}
                                    {selectedSubmission.annotations?.map((ann, i) => (
                                      <div
                                        key={i}
                                        className={`absolute border-2 rounded-lg flex items-center justify-center group pointer-events-none ${ann.isManual
                                            ? 'border-indigo-500 bg-indigo-500/20'
                                            : 'border-green-500 bg-green-500/20'
                                          }`}
                                        style={{
                                          top: `${ann.box_2d[0] / 10}%`,
                                          left: `${ann.box_2d[1] / 10}%`,
                                          height: `${(ann.box_2d[2] - ann.box_2d[0]) / 10}%`,
                                          width: `${(ann.box_2d[3] - ann.box_2d[1]) / 10}%`,
                                        }}
                                      >
                                        {/* Hover Label */}
                                        <div className="absolute -top-8 left-0 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 transition-opacity pointer-events-none">
                                          {ann.label}
                                        </div>

                                        {/* Score Badge */}
                                        {ann.score !== undefined && (
                                          <div className={`absolute -top-3 -right-3 w-6 h-6 text-white text-xs font-black rounded-full flex items-center justify-center shadow-lg border border-white z-10 ${ann.isManual ? 'bg-indigo-600' : 'bg-green-600'
                                            }`}>
                                            +{ann.score}
                                          </div>

                                        )}
                                      </div>
                                    ))}

                                    {/* Current Drawing Rect */}
                                    {currentRect && (
                                      <div
                                        className="absolute border-2 border-indigo-500 bg-indigo-500/20 z-20 pointer-events-none"
                                        style={{
                                          left: currentRect.x,
                                          top: currentRect.y,
                                          width: currentRect.w,
                                          height: currentRect.h
                                        }}
                                      />
                                    )}

                                    {/* Annotation Input Popover */}
                                    {showAnnotationForm && annotationFormPos && (
                                      <div
                                        className="absolute bg-white dark:bg-slate-800 p-4 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-[50] w-64 animate-in zoom-in-95 duration-200"
                                        style={{
                                          left: Math.min(annotationFormPos.x, 250),
                                          top: annotationFormPos.y
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()} // Prevent drag start
                                      >
                                        <h6 className="text-xs font-black uppercase text-slate-400 mb-2">Add Annotation</h6>
                                        <div className="space-y-3">
                                          <div>
                                            <input
                                              className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
                                              placeholder="Label (e.g. Good Point)"
                                              id="ann-label"
                                            />
                                          </div>
                                          <div>
                                            <input
                                              type="number"
                                              className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
                                              placeholder="Score Change (e.g. +1, -0.5)"
                                              step="0.5"
                                              id="ann-score"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Affects Criteria</label>
                                            <select className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500" id="ann-criterion">
                                              <option value="">-- General / None --</option>
                                              {assignment.markingPoints.map((m, i) => (
                                                <option key={i} value={i}>{i + 1}. {m.point} (Max: {m.weight})</option>
                                              ))}
                                            </select>
                                          </div>
                                          <div className="flex gap-2 pt-1">
                                            <button
                                              className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-1.5 rounded-lg"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const labelEl = document.getElementById('ann-label') as HTMLInputElement;
                                                const scoreEl = document.getElementById('ann-score') as HTMLInputElement;
                                                const critEl = document.getElementById('ann-criterion') as HTMLSelectElement;

                                                const label = labelEl.value || "Teacher Note";
                                                const score = parseFloat(scoreEl.value) || 0;
                                                const criterionIdx = critEl.value ? parseInt(critEl.value) : undefined;

                                                if (!editingSubmission || !tempBox) return;

                                                setEditingSubmission(prev => {
                                                  if (!prev) return null;

                                                  const newAnn: Annotation = {
                                                    label, score,
                                                    box_2d: tempBox,
                                                    isManual: true,
                                                    criterionIndex: criterionIdx
                                                  };

                                                  const updatedAnnotations = [...(prev.annotations || []), newAnn];
                                                  let updatedCriteriaScores = [...(prev.criteriaScores || [])];
                                                  let updatedEditedCriteria = [...(editingSubmission?.editedCriteria || (selectedSubmission.editedCriteria || []))];

                                                  if (!updatedEditedCriteria.length) updatedEditedCriteria = Array(assignment.markingPoints.length).fill(false);

                                                  // Update Linked Criterion
                                                  if (criterionIdx !== undefined && criterionIdx >= 0) {
                                                    const currentCritScore = updatedCriteriaScores[criterionIdx] || 0;
                                                    const maxCritScore = assignment.markingPoints[criterionIdx].weight;
                                                    let newCritScore = currentCritScore + score;
                                                    newCritScore = Math.max(0, Math.min(newCritScore, maxCritScore)); // Clamp

                                                    updatedCriteriaScores[criterionIdx] = newCritScore;
                                                    updatedEditedCriteria[criterionIdx] = true;
                                                  }

                                                  // Recalculate Total Score
                                                  // Should be sum of ALL criteria + unlinked annotations
                                                  const criteriaSum = updatedCriteriaScores.reduce((a, b) => a + (b || 0), 0);
                                                  const unlinkedAnnotationSum = updatedAnnotations
                                                    .filter(a => a.isManual && a.criterionIndex === undefined)
                                                    .reduce((a, b) => a + (b.score || 0), 0);

                                                  const cappedScore = Math.min(criteriaSum + unlinkedAnnotationSum, assignment.markingPoints.reduce((a, b) => a + b.weight, 0));

                                                  return {
                                                    ...prev,
                                                    annotations: updatedAnnotations,
                                                    criteriaScores: updatedCriteriaScores,
                                                    editedCriteria: updatedEditedCriteria,
                                                    score: cappedScore
                                                  };
                                                });

                                                setShowAnnotationForm(false);
                                                setCurrentRect(null);
                                                setTempBox(null);
                                              }}
                                            >
                                              Save
                                            </button>
                                            <button
                                              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-1.5 rounded-lg"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setShowAnnotationForm(false);
                                                setCurrentRect(null);
                                                setTempBox(null);
                                              }}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                  </div>
                                </div>
                              </div>

                            ) : (
                              <p className="mt-4 text-sm text-slate-400 italic">No image available for this submission.</p>
                            )}
                          </div>

                          <div className="space-y-3">
                            <h5 className="text-sm font-black uppercase tracking-widest text-slate-400">Criteria Breakdown</h5>
                            <div className="space-y-2">
                              {assignment.markingPoints.map((criterion, idx) => {
                                const met = selectedSubmission.criteriasMet?.[idx];
                                const score = selectedSubmission.criteriaScores?.[idx];

                                const isEditing = editingSubmission && editingSubmission.id === selectedSubmission.id;
                                const originalScore = selectedSubmission.criteriaScores?.[idx] ?? 0;
                                const currentScore = isEditing ? (editingSubmission.criteriaScores?.[idx] ?? 0) : originalScore;

                                const wasEdited = selectedSubmission.editedCriteria?.[idx];
                                const isChangedLocal = isEditing && currentScore !== originalScore;
                                const showHighlight = isChangedLocal || wasEdited;

                                const color = showHighlight
                                  ? 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 shadow-sm border-2'
                                  : met === true
                                    ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                    : met === false
                                      ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                                      : 'border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300';

                                return (
                                  <div
                                    key={idx}
                                    className={`p-4 rounded-2xl border ${color} flex items-center justify-between gap-4 transition-all`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center ${met ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-800' : 'bg-white/70 dark:bg-slate-800/80'}`}>
                                        {met ? '✓' : idx + 1}
                                      </div>
                                      <div className="text-sm font-semibold leading-snug select-none">{criterion.point}</div>
                                    </div>
                                    <div className="text-sm font-black">
                                      {editingSubmission && editingSubmission.id === selectedSubmission.id ? (
                                        <select
                                          value={editingSubmission.criteriaScores?.[idx] ?? 0}
                                          onClick={e => e.stopPropagation()} // Prevent parent click
                                          onChange={e => {
                                            const newVal = parseFloat(e.target.value);
                                            setEditingSubmission(prev => {
                                              if (!prev) return null;
                                              const newMet = [...(prev.criteriasMet || [])];
                                              newMet[idx] = newVal > 0; // True if any points given

                                              const newScores = [...(prev.criteriaScores || [])];
                                              newScores[idx] = newVal;

                                              // Recalculate total score
                                              const criteriaSum = newScores.reduce((a, b) => a + (b || 0), 0);
                                              // Only add scores from MANUAL annotations to avoid double counting AI marks
                                              const annotationSum = prev.annotations?.filter(a => a.isManual).reduce((a, b) => a + (b.score || 0), 0) || 0;
                                              const cappedScore = Math.min(criteriaSum + annotationSum, prev.maxScore);

                                              return {
                                                ...prev,
                                                criteriasMet: newMet,
                                                criteriaScores: newScores,
                                                score: cappedScore
                                              };
                                            });
                                          }}
                                          className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                                        >
                                          {Array.from({ length: (criterion.weight * 2) + 1 }, (_, i) => i * 0.5).map(val => (
                                            <option key={val} value={val}>{val}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span>{score !== undefined ? score : '—'}</span>
                                      )}

                                      <span className="opacity-50 ml-1">/ {criterion.weight}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
              }
            </div>
          );
        })}
      </div>
    </div >
  );
};

export default TeacherDashboard;

const AssignmentCard: React.FC<{ assignment: Assignment, onClick: () => void, isDraft?: boolean, onScan?: () => void }> = ({ assignment, onClick, isDraft, onScan }) => (
  <div
    onClick={onClick}
    className={`group cursor-pointer bg-white dark:bg-slate-800 border ${isDraft ? 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60' : 'border-slate-200 dark:border-slate-700'} rounded-3xl p-7 shadow-sm hover:shadow-xl hover:border-indigo-400 transition-all hover:-translate-y-1 relative overflow-hidden`}
  >
    <div className="flex justify-between items-start mb-4">
      <div className={`w-12 h-12 ${isDraft ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'} rounded-2xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform`}>
        {isDraft ? '📝' : '📄'}
      </div>

      {/* Scan Button */}
      {!isDraft && onScan && (
        <button
          onClick={(e) => { e.stopPropagation(); onScan(); }}
          className="flex items-center gap-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2 rounded-full font-bold text-xs transition-colors shadow-sm z-10"
          title="Scan Submissions"
        >
          <Camera className="w-4 h-4" />
          <span>SCAN SUBMISSIONS</span>
        </button>
      )}
    </div>

    <h3 className="text-xl font-bold mb-2 group-hover:text-indigo-600 transition-colors line-clamp-1">{assignment.title}</h3>
    <p className="text-slate-500 text-sm line-clamp-3 mb-6 leading-relaxed">{assignment.question}</p>
    <div className="pt-6 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-2 text-xs font-bold text-slate-400">
      <div className="flex justify-between items-center w-full">
        <span>{new Date(assignment.createdAt).toLocaleDateString()}</span>
        {assignment.dueDate && (
          <span className={`px-2 py-1 rounded bg-slate-100 dark:bg-slate-700/50 ${Date.now() > assignment.dueDate ? 'text-red-500' : 'text-slate-500'}`}>
            Due: {new Date(assignment.dueDate).toLocaleString()}
          </span>
        )}
      </div>
      <span className={`px-3 py-1 rounded-full text-[10px] ${isDraft ? 'bg-slate-200 text-slate-600' : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600'}`}>
        {isDraft ? 'DRAFT' : 'View Details'}
      </span>
    </div>
  </div>
);
