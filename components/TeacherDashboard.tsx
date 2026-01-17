
import React, { useState } from 'react';
import { Assignment, Submission, MarkingCriterion } from '../types';
import { extractMarkingPoints } from '../services/geminiService';

interface Props {
  assignments: Assignment[];
  submissions: Submission[];
  onCreateAssignment: (a: Assignment) => void;
}

const TeacherDashboard: React.FC<Props> = ({ assignments, submissions, onCreateAssignment }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  
  // Create Form State
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
      setCriteria(points.map(p => ({ point: p, weight: 1 })));
    } catch (err) {
      alert("Could not extract marking points automatically.");
    } finally {
      setLoading(false);
    }
  };

  const addCriterion = () => setCriteria([...criteria, { point: '', weight: 1 }]);
  
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
        <h2 className="text-2xl font-bold text-slate-800">Your Assignments</h2>
        <button 
          onClick={() => setShowAdd(true)}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
        >
          + New Assignment
        </button>
      </div>

      {/* CREATE ASSIGNMENT MODAL */}
      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl">
            <h3 className="text-2xl font-bold mb-6 text-slate-800">Create Assignment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input 
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  value={title} onChange={e => setTitle(e.target.value)} 
                  placeholder="e.g. History Mid-Term - WW2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Question Description</label>
                <textarea 
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none h-24" 
                  value={question} onChange={e => setQuestion(e.target.value)}
                  placeholder="Describe the question for the students..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Upload Reference Answer (Image)</label>
                <input type="file" accept="image/*" onChange={handleImageChange} className="w-full text-sm" />
                {image && (
                  <div className="mt-4 flex flex-col items-center p-4 bg-slate-50 rounded-lg">
                    <img src={image} className="max-h-40 rounded border shadow-sm" alt="Reference" />
                    <button 
                      onClick={suggestMarkingPoints}
                      disabled={loading}
                      className="mt-2 text-indigo-600 font-semibold hover:underline"
                    >
                      {loading ? 'Analyzing image...' : '✨ Suggest marking points from image'}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-slate-700">Marking Rubric (Points)</label>
                  <button onClick={addCriterion} className="text-sm text-indigo-600 font-bold">+ Add Point</button>
                </div>
                <div className="space-y-2">
                  {criteria.map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <input 
                        className="flex-1 border rounded-lg p-2 text-sm" 
                        placeholder="Criterion description..." 
                        value={c.point}
                        onChange={e => {
                          const next = [...criteria];
                          next[i].point = e.target.value;
                          setCriteria(next);
                        }}
                      />
                      <input 
                        type="number" 
                        className="w-16 border rounded-lg p-2 text-sm" 
                        value={c.weight}
                        onChange={e => {
                          const next = [...criteria];
                          next[i].weight = parseInt(e.target.value);
                          setCriteria(next);
                        }}
                      />
                    </div>
                  ))}
                  {criteria.length === 0 && (
                    <p className="text-sm text-slate-400 italic text-center py-4 bg-slate-50 border-2 border-dashed rounded-lg">
                      No marking points yet. Upload an answer or add manually.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-3 border rounded-xl font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSubmit}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW ASSIGNMENT MODAL */}
      {selectedAssignment && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative">
            <button 
              onClick={() => setSelectedAssignment(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-2xl font-bold mb-2 text-slate-800">{selectedAssignment.title}</h3>
            <p className="text-sm text-slate-400 mb-6 italic">Created on {new Date(selectedAssignment.createdAt).toLocaleString()}</p>
            
            <div className="space-y-6">
              <div>
                <h4 className="font-bold text-slate-700 mb-2 uppercase text-xs tracking-wider">Question Description</h4>
                <div className="p-4 bg-slate-50 rounded-xl border text-slate-800 whitespace-pre-wrap">{selectedAssignment.question}</div>
              </div>

              {selectedAssignment.teacherAnswerImage && (
                <div>
                  <h4 className="font-bold text-slate-700 mb-2 uppercase text-xs tracking-wider">Reference Answer Image</h4>
                  <img src={selectedAssignment.teacherAnswerImage} className="max-h-64 rounded-xl shadow-sm border" alt="Reference" />
                </div>
              )}

              <div>
                <h4 className="font-bold text-slate-700 mb-2 uppercase text-xs tracking-wider">Marking Criteria</h4>
                <div className="space-y-2">
                  {selectedAssignment.markingPoints.map((m, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                      <span className="text-slate-700">{m.point}</span>
                      <span className="font-bold text-indigo-600">+{m.weight}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW SUBMISSION MODAL */}
      {selectedSubmission && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative">
            <button 
              onClick={() => setSelectedSubmission(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xl uppercase">
                {selectedSubmission.studentName.charAt(0)}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-800">{selectedSubmission.studentName}</h3>
                <p className="text-sm text-slate-500">Submitted for {assignments.find(a => a.id === selectedSubmission.assignmentId)?.title}</p>
              </div>
              <div className="ml-auto text-right">
                <div className="text-3xl font-black text-indigo-600">{selectedSubmission.score} / {selectedSubmission.maxScore}</div>
                <div className="text-xs font-bold text-green-600 uppercase">AI Evaluated</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h4 className="font-bold text-slate-700 mb-2 uppercase text-xs tracking-wider">Student's Work</h4>
                <div className="border rounded-xl overflow-hidden shadow-sm bg-slate-100">
                  <img src={selectedSubmission.studentAnswerImage} className="w-full object-contain max-h-[500px]" alt="Student Submission" />
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-slate-700 mb-2 uppercase text-xs tracking-wider">AI Feedback</h4>
                  <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100 text-slate-800 italic leading-relaxed">
                    "{selectedSubmission.feedback}"
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-slate-700 mb-2 uppercase text-xs tracking-wider">Reference Used</h4>
                  {assignments.find(a => a.id === selectedSubmission.assignmentId)?.teacherAnswerImage ? (
                    <img src={assignments.find(a => a.id === selectedSubmission.assignmentId)?.teacherAnswerImage} className="max-h-32 rounded border" alt="Reference" />
                  ) : (
                    <p className="text-xs text-slate-400 italic">No reference image was provided for this assignment.</p>
                  )}
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
              className="bg-white border rounded-xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:border-indigo-300"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-slate-800 group-hover:text-indigo-600">{a.title}</h3>
                <svg className="w-5 h-5 text-slate-300 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </div>
              <p className="text-slate-500 text-sm line-clamp-2">{a.question}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Created {new Date(a.createdAt).toLocaleDateString()}</span>
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full">{subCount} Submissions</span>
              </div>
            </div>
          );
        })}
        {assignments.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed rounded-2xl bg-white">
            <p className="text-slate-400">No assignments created yet.</p>
          </div>
        )}
      </div>

      <div className="mt-12">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Recent Submissions</h2>
        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Student</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Assignment</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Score</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {submissions.map(s => {
                const assign = assignments.find(a => a.id === s.assignmentId);
                return (
                  <tr key={s.id} className="hover:bg-slate-50 group cursor-pointer" onClick={() => setSelectedSubmission(s)}>
                    <td className="px-6 py-4 font-medium text-slate-800">{s.studentName}</td>
                    <td className="px-6 py-4 text-slate-600">{assign?.title || 'Unknown'}</td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-indigo-600">{s.score} / {s.maxScore}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">Graded (AI)</span>
                    </td>
                    <td className="px-6 py-4 text-indigo-600 font-semibold text-sm group-hover:underline">
                      View Answer
                    </td>
                  </tr>
                );
              })}
              {submissions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400">No submissions to show.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
