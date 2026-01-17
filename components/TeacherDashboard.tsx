
import React, { useState } from 'react';
import { Assignment, Submission, MarkingCriterion } from '../types';
import { extractMarkingPoints } from '../services/geminiService';

interface Props {
  // Fixed typo: changed assignments[] to Assignment[]
  assignments: Assignment[];
  submissions: Submission[];
  onCreateAssignment: (a: Assignment) => void;
}

const TeacherDashboard: React.FC<Props> = ({ assignments, submissions, onCreateAssignment }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<MarkingCriterion[]>([]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const suggestMarkingPoints = async () => {
    if (!image) return;
    setLoading(true);
    try {
      const points = await extractMarkingPoints(image);
      // Append suggested points to existing ones
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
      teacherAnswerImage: image || undefined,
      markingPoints: criteria,
      createdAt: Date.now()
    };
    onCreateAssignment(newA);
    setShowAdd(false);
    setTitle('');
    setQuestion('');
    setImage(null);
    setCriteria([]);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Your Assignments</h2>
        <button 
          onClick={() => setShowAdd(true)}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 dark:shadow-none"
        >
          + New Assignment
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl transition-colors border dark:border-slate-800">
            <h3 className="text-2xl font-bold mb-6 text-slate-800 dark:text-white">Create Assignment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
                <input 
                  className="w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors" 
                  value={title} onChange={e => setTitle(e.target.value)} 
                  placeholder="e.g. History Mid-Term"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Question Description</label>
                <textarea 
                  className="w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none h-24 transition-colors" 
                  value={question} onChange={e => setQuestion(e.target.value)}
                  placeholder="Describe the question..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Upload Reference Answer (Image)</label>
                <input type="file" accept="image/*" onChange={handleImageChange} className="w-full text-sm text-slate-500 dark:text-slate-400" />
                {image && (
                  <div className="mt-4 flex flex-col items-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border dark:border-slate-700">
                    <img src={image} className="max-h-40 rounded border dark:border-slate-600 shadow-sm" alt="Reference" />
                    <button 
                      onClick={suggestMarkingPoints}
                      disabled={loading}
                      className="mt-2 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                    >
                      {loading ? 'Analyzing image...' : '✨ Suggest marking points from image'}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Marking Rubric (Points)</label>
                  <button onClick={addCriterion} className="text-sm text-indigo-600 dark:text-indigo-400 font-bold hover:opacity-80">+ Add Point Manually</button>
                </div>
                <div className="space-y-3">
                  {criteria.map((c, i) => (
                    <div key={i} className="flex gap-2 items-start animate-in fade-in slide-in-from-top-1">
                      <div className="flex-1 space-y-1">
                        <input 
                          className="w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-2 text-sm text-slate-900 dark:text-white transition-colors focus:border-indigo-500 outline-none" 
                          placeholder="Criterion description..." 
                          value={c.point}
                          onChange={e => updateCriterion(i, 'point', e.target.value)}
                        />
                      </div>
                      <div className="w-20">
                        <input 
                          type="number" 
                          className="w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-2 text-sm text-slate-900 dark:text-white transition-colors focus:border-indigo-500 outline-none" 
                          value={c.weight}
                          min="0"
                          onChange={e => updateCriterion(i, 'weight', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <button 
                        onClick={() => removeCriterion(i)}
                        className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        title="Delete criterion"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                  {criteria.length === 0 && (
                    <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-6 bg-slate-50 dark:bg-slate-800/30 border-2 border-dashed dark:border-slate-700 rounded-xl">
                      No marking points yet. {image ? 'Click "Suggest marking points" above' : 'Add points manually or upload an image'}.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t dark:border-slate-800">
                <button 
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-3 border dark:border-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSubmit}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                >
                  Create Assignment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative border dark:border-slate-800">
            <button 
              onClick={() => setSelectedAssignment(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-2xl font-bold mb-2 text-slate-800 dark:text-white">{selectedAssignment.title}</h3>
            <p className="text-sm text-slate-400 dark:text-slate-500 mb-6 italic">Created on {new Date(selectedAssignment.createdAt).toLocaleString()}</p>
            
            <div className="space-y-6">
              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase text-xs tracking-wider">Description</h4>
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border dark:border-slate-700 text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{selectedAssignment.question}</div>
              </div>

              {selectedAssignment.teacherAnswerImage && (
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase text-xs tracking-wider">Reference Answer</h4>
                  <img src={selectedAssignment.teacherAnswerImage} className="max-h-64 rounded-xl shadow-sm border dark:border-slate-700" alt="Reference" />
                </div>
              )}

              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase text-xs tracking-wider">Criteria</h4>
                <div className="space-y-2">
                  {selectedAssignment.markingPoints.map((m, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                      <span className="text-slate-700 dark:text-slate-300">{m.point}</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">+{m.weight}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedSubmission && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative border dark:border-slate-800">
            <button 
              onClick={() => setSelectedSubmission(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center font-bold text-xl uppercase">
                {selectedSubmission.studentName.charAt(0)}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{selectedSubmission.studentName}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Submitted for {assignments.find(a => a.id === selectedSubmission.assignmentId)?.title}</p>
              </div>
              <div className="ml-auto text-right">
                <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{selectedSubmission.score} / {selectedSubmission.maxScore}</div>
                <div className="text-xs font-bold text-green-600 dark:text-green-400 uppercase">AI Evaluated</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase text-xs tracking-wider">Student's Work</h4>
                <div className="border dark:border-slate-700 rounded-xl overflow-hidden shadow-sm bg-slate-100 dark:bg-slate-800">
                  <img src={selectedSubmission.studentAnswerImage} className="w-full object-contain max-h-[500px]" alt="Student Submission" />
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase text-xs tracking-wider">AI Feedback</h4>
                  <div className="p-6 bg-indigo-50 dark:bg-slate-800 rounded-2xl border border-indigo-100 dark:border-slate-700 text-slate-800 dark:text-slate-200 italic leading-relaxed">
                    "{selectedSubmission.feedback}"
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {assignments.map(a => {
          const subCount = submissions.filter(s => s.assignmentId === a.id).length;
          return (
            <div 
              key={a.id} 
              onClick={() => setSelectedAssignment(a)}
              className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:border-indigo-300 dark:hover:border-indigo-500"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{a.title}</h3>
                <svg className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm line-clamp-2">{a.question}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Created {new Date(a.createdAt).toLocaleDateString()}</span>
                <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded-full">{subCount} Submissions</span>
              </div>
            </div>
          );
        })}
        {assignments.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
            <p className="text-slate-400 dark:text-slate-500">No assignments created yet.</p>
          </div>
        )}
      </div>

      <div className="mt-12">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Recent Submissions</h2>
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Student</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Assignment</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Score</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800">
                {submissions.map(s => {
                  const assign = assignments.find(a => a.id === s.assignmentId);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 group cursor-pointer" onClick={() => setSelectedSubmission(s)}>
                      <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{s.studentName}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{assign?.title || 'Unknown'}</td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{s.score} / {s.maxScore}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold rounded">Graded</span>
                      </td>
                      <td className="px-6 py-4 text-indigo-600 dark:text-indigo-400 font-semibold text-sm group-hover:underline">
                        View
                      </td>
                    </tr>
                  );
                })}
                {submissions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-400 dark:text-slate-500">No submissions to show.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
