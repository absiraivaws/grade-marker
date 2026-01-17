
export enum UserRole {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT'
}

export interface MarkingCriterion {
  point: string;
  weight: number;
}

export interface Assignment {
  id: string;
  title: string;
  question: string;
  teacherAnswerImage?: string; // Base64
  markingPoints: MarkingCriterion[];
  createdAt: number;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentName: string;
  studentAnswerImage: string; // Base64
  feedback: string;
  score: number;
  maxScore: number;
  criteriaScores?: number[]; // Stores numerical scores per criterion
  criteriasMet?: boolean[]; // Stores AI decision (met/not met)
  gradedAt?: number;
}

export interface AIResponse {
  score: number;
  totalPossible: number;
  feedback: string;
  criteriasMet: boolean[];
}
