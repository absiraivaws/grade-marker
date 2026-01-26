
export interface Textbook {
  id: string;
  studentId: string; // The student who uploaded it
  title: string;
  subjectId: string; // Optional: link to a subject if known
  fileUrl: string; // Storage URL
  uploadedAt: number;
  status: 'PROCESSING' | 'READY' | 'ERROR';
  pageCount?: number;
}

export interface LearningActivity {
  id: string;
  textbookId: string;
  chapter?: string;
  topic?: string;
  question: string; // The exercise content
  type: 'QA' | 'MCQ' | 'PRACTICE'; // Type of activity
  difficulty?: 'easy' | 'medium' | 'hard';
  pageNumber?: number; // Where it was found in the textbook
}

export interface ActivitySubmission {
  id: string;
  activityId: string;
  studentId: string;
  answerImageUrls: string[]; // Storage URLs
  answerImageBase64?: string[]; // For AI
  score: number;
  maxScore: number;
  feedback: string;
  isCorrect: boolean;
  submittedAt: number;
  attempts: number;
}
