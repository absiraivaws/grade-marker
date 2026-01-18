
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
  teacherAnswerImages?: string[];
  markingPoints: MarkingCriterion[];
  createdAt: number;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  studentAnswerImages: string[];
  feedback: string;
  score: number;
  maxScore: number;
  criteriaScores?: number[];
  criteriasMet?: boolean[];
  gradedAt?: number;
}
