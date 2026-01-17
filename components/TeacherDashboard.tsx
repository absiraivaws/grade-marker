
import React, { useState, useMemo } from 'react';
import { Assignment, Submission, MarkingCriterion } from '../types';
import { extractMarkingPoints } from '../services/geminiService';

interface Props {
  assignments: Assignment[];
  submissions: Submission[];
  onCreateAssignment: (a: Assignment) => void;
  onUpdateSubmission: (s: Submission) => void;
}

const TeacherDashboard: React.FC<Props> = ({ assignments, submissions, onCreateAssignment, onUpdateSubmission }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isEditingMarks, setIsEditingMarks] = useState(false);
  const [tempScores, setTempScores] = useState<number[]>([]);
  
  const [filterAssignmentId, setFilterAssignmentId] = useState<string>('all');
  const [filterStudentName, setFilterStudentName] = useState<string>('all');
  
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<MarkingCriterion[]>([]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = ""; // Clear input for same-file re-selection if needed
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const suggestMarkingPoints = async () => {
    if (images.length === 0) return;
    setLoading(true);
    try {
      const points = await extractMarkingPoints(images);
      const suggested = points.map(p => ({ point: p, weight: 1 }));
      setCriteria([...criteria, ...suggested]);
    } catch (err) {
      alert("Could not extract marking points automatically.");
    } finally {
      setLoading(false);
    }
  };

  const addCriterion = () => setCriteria([...criteria, { point: '', weight: 1 }]);
  const removeCriterion = (index: number) => {
    const next = [...criteria];
    next.splice(index, 1);
    setCriteria(next);
  };

  const updateCriterion = (index: number, field: keyof MarkingCriterion, value: string | number) => {
    const next = [...criteria];
    next[index] = { ...next[index], [field]: value };
    setCriteria(next);
  };

  const handleSubmit = () => {
    if (!title || !question || criteria.length === 0) {
      alert("Please fill in all fields and add at least one marking point.");
      return;
    }
    const newA: Assignment = {
      id: Date.now().toString(),
      title,
      question,
      teacherAnswerImages: images,
      markingPoints: criteria,
      createdAt: Date.now()
    };
    onCreateAssignment(newA);
    setShowAdd(false);
    setTitle('');
    setQuestion('');
    setImages([]);
    setCriteria([]);
  };

  const startEditing = () => {
    if (!selectedSubmission) return;
    const assignment = assignments.find(a => a.id === selectedSubmission.assignmentId);
    if (!assignment) return;
    const currentScores = selectedSubmission.criteriaScores 
      ? [...selectedSubmission.criteriaScores] 
      : (selectedSubmission.criteriasMet?.map((met, i) => met ? assignment.markingPoints[i].weight : 0) || new Array(assignment.markingPoints.length).fill(0));
    setTempScores(currentScores);
    setIsEditingMarks(true);
  };

  const handleTempMarkChange = (idx: number, val: number) => {
    const next = [...tempScores];
    next[idx] = val;
    setTempScores(next);
  };

  const saveManualMarks = () => {
    if (!selectedSubmission) return;
    const assignment = assignments.find(a => a.id === selectedSubmission.assignmentId);
    if (!assignment) return;
    const newTotalScore = tempScores.reduce((a, b) => a + b, 0);
    const updatedSubmission: Submission = {
      ...selectedSubmission,
      criteriaScores: tempScores,
      score: newTotalScore,
      criteriasMet: tempScores.map((s, i) => s === assignment.markingPoints[i].weight)
    };
    onUpdateSubmission(updatedSubmission);
    setSelectedSubmission(updatedSubmission);
    setIsEditingMarks(false);
  };

  const generateDropdownOptions = (maxWeight: number) => {
    const options = [];
    for (let i = 0; i <= maxWeight; i += 0.5) {
      options.push(i);
    }
    if (options.length === 0 || options[options.length - 1] !== maxWeight) {
      options.push(maxWeight);
    }
    return Array.from(new Set(options)).sort((a, b) => a - b);
  };

  const uniqueStudents = useMemo(() => Array.from(new Set(submissions.map(s => s.studentName))).sort(), [submissions]);
  const sortedAssignments = useMemo(() => [...assignments].sort((a, b) => b.createdAt - a.createdAt), [assignments]);
  const filteredSubmissions = useMemo(() => {
    return submissions
      .filter(s => (filterAssignmentId === 'all' || s.assignmentId === filterAssignmentId) && (filterStudentName === 'all' || s.studentName === filterStudentName))
      .sort((a, b) => (b.gradedAt || 0) - (a.gradedAt || 0));
  }, [submissions, filterAssignmentId, filterStudentName]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Your Assignments</h2>
        <button onClick={() => setShowAdd(true)} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors shadow-lg">
          + New Assignment
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedAssignments.map(a => (
          <div key={a.id} onClick={() => setSelectedAssignment(a)} className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:border-indigo-300">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-lg text-slate-800 dark:text-white group-hover:text-indigo-600">{a.title}</h3>
              <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </div>
            <p className="text-slate-500 text-sm line-clamp-2">{a.question}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-slate-400">Created {new Date(a.createdAt).toLocaleDateString()}</span>
              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full">{submissions.filter(s => s.assignmentId === a.id).length} Submissions</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Recent Submissions</h2>
          <div className="flex flex-wrap items-center gap-4">
            <select value={filterAssignmentId} onChange={(e) => setFilterAssignmentId(e.target.value)} className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none">
              <option value="all">All Assignments</option>
              {sortedAssignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
            <select value={filterStudentName} onChange={(e) => setFilterStudentName(e.target.value)} className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none">
              <option value="all">All Students</option>
              {uniqueStudents.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Student</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Assignment</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Score</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {filteredSubmissions.length > 0 ? (
                filteredSubmissions.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => { setSelectedSubmission(s); setIsEditingMarks(false); }}>
                    <td className="px-6 py-4 font-medium">{s.studentName}</td>
                    <td className="px-6 py-4 text-slate-600">{assignments.find(a => a.id === s.assignmentId)?.title}</td>
                    <td className="px-6 py-4 font-bold text-indigo-600 whitespace-nowrap">{s.score} / {s.maxScore}</td>
                    <td className="px-6 py-4 text-indigo-600 font-semibold text-sm text-right">Review</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No submissions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl border dark:border-slate-800">
            <h3 className="text-2xl font-bold mb-6 text-slate-800 dark:text-white">Create Assignment</h3>
            <div className="space-y-4">
              <input className="w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-2.5 text-slate-900 dark:text-white outline-none" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
              <textarea className="w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-2.5 text-slate-900 dark:text-white outline-none h-24" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Question description..." />
              
              <div>
                <label className="block text-sm font-medium mb-1">Upload Reference Answers (In Order)</label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group w-20 h-20">
                      <img src={img} className="w-full h-full object-cover rounded border border-slate-200" alt={`Page ${idx+1}`} />
                      <button onClick={() => removeImage(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center shadow-lg">×</button>
                      <span className="absolute bottom-0 right-0 bg-black/50 text-white text-[10px] px-1 rounded-tl">{idx+1}</span>
                    </div>
                  ))}
                  <label className="w-20 h-20 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors">
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                    <span className="text-xl text-slate-400">+</span>
                  </label>
                </div>
                {images.length > 0 && (
                  <button onClick={suggestMarkingPoints} disabled={loading} className="text-sm text-indigo-600 font-semibold hover:underline">
                    {loading ? 'Analyzing...' : '✨ Suggest points from images'}
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center"><label className="text-sm font-medium">Marking Rubric</label><button onClick={addCriterion} className="text-xs text-indigo-600 font-bold">+ Add Point</button></div>
                {criteria.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="flex-1 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-2 text-sm" value={c.point} onChange={e => updateCriterion(i, 'point', e.target.value)} placeholder="Point description" />
                    <input type="number" step="0.5" className="w-16 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-2 text-sm" value={c.weight} onChange={e => updateCriterion(i, 'weight', parseFloat(e.target.value) || 0)} />
                    <button onClick={() => removeCriterion(i)} className="text-red-500">×</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 pt-4 border-t dark:border-slate-800">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-3 font-bold text-slate-500">Cancel</button>
                <button 
                  onClick={handleSubmit} 
                  disabled={criteria.length === 0} 
                  className={`flex-1 py-3 text-white rounded-xl font-bold transition-all ${criteria.length === 0 ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative border dark:border-slate-800">
            <button onClick={() => setSelectedAssignment(null)} className="absolute top-6 right-6 text-slate-400"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-2xl font-bold mb-6">{selectedAssignment.title}</h3>
            <div className="space-y-6">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border dark:border-slate-700 whitespace-pre-wrap">{selectedAssignment.question}</div>
              {selectedAssignment.teacherAnswerImages && (
                <div className="grid grid-cols-2 gap-2">
                  {selectedAssignment.teacherAnswerImages.map((img, i) => (
                    <img key={i} src={img} className="rounded border shadow-sm" alt={`Ref ${i+1}`} />
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <h4 className="font-bold text-xs uppercase text-slate-500 tracking-wider">Criteria</h4>
                {selectedAssignment.markingPoints.map((m, idx) => (
                  <div key={idx} className="flex justify-between p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded border border-indigo-100">
                    <span className="text-sm">{m.point}</span>
                    <span className="font-bold text-indigo-600 whitespace-nowrap">+{m.weight}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedSubmission && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative border dark:border-slate-800">
            <button onClick={() => { setSelectedSubmission(null); setIsEditingMarks(false); }} className="absolute top-6 right-6 text-slate-400"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            <div className="flex items-center gap-4 mb-6">
              <h3 className="text-2xl font-bold">{selectedSubmission.studentName}'s Submission</h3>
              <div className="ml-auto text-4xl font-black text-indigo-600 whitespace-nowrap">
                {isEditingMarks ? tempScores.reduce((a, b) => a + b, 0) : selectedSubmission.score} / {selectedSubmission.maxScore}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="font-bold text-xs uppercase text-slate-500">Student Images</h4>
                <div className="grid gap-4">
                  {selectedSubmission.studentAnswerImages.map((img, idx) => (
                    <img key={idx} src={img} className="w-full rounded border" alt={`Page ${idx+1}`} />
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-xs uppercase text-slate-500">Breakdown</h4>
                  {!isEditingMarks ? (
                    <button onClick={startEditing} className="text-xs font-bold text-indigo-600">Edit Marks</button>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={() => setIsEditingMarks(false)} className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
                      <button onClick={saveManualMarks} className="text-xs font-bold text-green-600">Save Changes</button>
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border dark:border-slate-700 divide-y">
                  {assignments.find(a => a.id === selectedSubmission.assignmentId)?.markingPoints.map((mp, idx) => {
                    const currentScore = isEditingMarks ? tempScores[idx] : (selectedSubmission.criteriaScores ? selectedSubmission.criteriaScores[idx] : (selectedSubmission.criteriasMet?.[idx] ? mp.weight : 0));
                    
                    // Determine if this specific mark was edited manually
                    const wasEdited = !isEditingMarks && selectedSubmission.criteriaScores && (
                        currentScore !== (selectedSubmission.criteriasMet?.[idx] ? mp.weight : 0)
                    );

                    return (
                      <div key={idx} className="p-4 flex justify-between items-start gap-4">
                        <span className="text-sm flex-1">{mp.point}</span>
                        <div className="shrink-0">
                          {isEditingMarks ? (
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <select value={currentScore} onChange={e => handleTempMarkChange(idx, parseFloat(e.target.value))} className="text-sm font-bold bg-white text-slate-900 border rounded p-1 outline-none">
                                {generateDropdownOptions(mp.weight).map(v => <option key={v} value={v}>{v}</option>)}
                              </select>
                              <span className="text-xs text-slate-400">/ {mp.weight}</span>
                            </div>
                          ) : (
                            <span className={`text-sm font-bold whitespace-nowrap shrink-0 ${wasEdited ? 'text-amber-600 dark:text-amber-400' : currentScore === mp.weight ? 'text-green-600' : 'text-red-500'}`}>{currentScore} / {mp.weight}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
