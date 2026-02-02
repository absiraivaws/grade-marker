
export enum UserRole {
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT'
}

export interface School {
  id: string;
  name: string;
  adminId: string;
}

export interface Teacher {
  id: string; // uid from firebase auth
  name: string;
  email: string;
  schoolId: string;
  primarySubject: string; // e.g., "Mathematics"
  isClassTeacher: boolean;
  assignedClassId?: string; // If class teacher
  assignedSubjects: AssignedSubject[];
}

export interface AssignedSubject {
  gradeId: string;
  classId: string;
  subjectId: string;
}

export interface Grade {
  id: string;
  name: string; // e.g., "Grade 6"
  schoolId: string;
}

export interface Class {
  id: string;
  name: string; // e.g., "6A"
  gradeId: string;
  classTeacherId?: string;
  studentIds?: string[];
  subjectTeachers?: { [subjectId: string]: string }; // subjectId -> teacherId
}

export interface Subject {
  id: string;
  name: string;
  gradeId: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  schoolId: string;
  gradeId: string;
  classId: string;
}

export interface MarkingCriterion {
  point: string;
  weight: number;
}

export interface Assignment {
  id: string;
  title: string;
  question: string;
  gradeId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  teacherAnswerImages?: string[]; // Storage URLs
  teacherAnswerImagesBase64?: string[]; // Base64 for Gemini
  markingPoints: MarkingCriterion[];
  createdAt: number;
  dueDate?: number; // New: Deadline
  allowLateSubmissions?: boolean; // New: If flase, block after due date
  treatLateAsNormal?: boolean; // New: If true, ignore due date (re-enabled mode)
  status: 'DRAFT' | 'PUBLISHED';
}

export interface Annotation {
  label: string;
  score?: number; // Added score field
  box_2d: number[]; // [ymin, xmin, ymax, xmax] in 0-1000 scale
  isManual?: boolean; // New: To distinguish from AI annotations
  criterionIndex?: number; // New: Link to specific marking point
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  studentAnswerImages: string[]; // Storage URLs
  studentAnswerImagesBase64?: string[]; // Base64 for Gemini
  feedback: string;
  score: number;
  maxScore: number;
  criteriaScores?: number[];
  criteriasMet?: boolean[];
  annotations?: Annotation[];
  gradedAt?: number;
  isLate?: boolean; // New: Submitted after due date
  isEdited?: boolean; // New: Manually edited by teacher
  editedCriteria?: boolean[]; // New: Track which specific criteria were modified
}

export interface AIResponse {
  score: number;
  totalPossible: number;
  feedback: string;
  criteriasMet: boolean[];
  annotations?: Annotation[];
}

export interface GeneratedNote {
  id: string;
  teacherId: string;
  subjectId: string;
  classId: string;
  className?: string;
  subjectName?: string;
  content: string;
  summary: string;
  createdAt: number;
  updatedAt?: number;
  moduleTitle?: string;
  originalContent?: string;
  isLatest: boolean;
  groupId?: string;
}


export interface NoteCorrection {
  id: string;
  originalContent: string;
  correctedContent: string;
  correctionPrompt: string;
  correctionSummary: string;
  timestamp: number;
  teacherId: string;
  createdAt?: number; // DB timestamp
}

// --- Continuous Learning ---

export interface Textbook {
  id: string;
  studentId: string;
  title: string;
  subjectId: string;
  fileUrl: string;
  uploadedAt: number;
  status: 'PROCESSING' | 'READY' | 'ERROR';
  pageCount?: number;
  totalActivities?: number;
}

export interface LearningActivity {
  id: string;
  textbookId: string;
  title?: string; // e.g. "Exercise 1.1" or "Question 5"
  chapter?: string;
  topic?: string;
  question: string;
  type: 'QA' | 'MCQ' | 'PRACTICE';
  difficulty?: 'easy' | 'medium' | 'hard';
  pageNumber?: number;
  status?: 'PENDING' | 'COMPLETED'; // Local UI state mainly
}

export interface ActivitySubmission {
  id: string;
  activityId: string;
  textbookId?: string; // For easier progress tracking
  studentId: string;
  answerImageUrls: string[];
  score?: number;
  maxScore?: number;
  feedback?: string;
  isCorrect?: boolean;
  submittedAt: number;
  attempts: number;
  status: 'SUBMITTED' | 'GRADED';
}
