
import { GoogleGenAI, Type } from "@google/genai";
import { LearningActivity, ActivitySubmission } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const getMimeType = (base64: string): string => {
  const match = base64.match(/^data:([^;]+);/);
  return match ? match[1] : "application/pdf";
};

// --- Textbook Extraction ---

export const extractActivitiesFromTextbook = async (
  textbookBase64: string,
  textbookId: string
): Promise<LearningActivity[]> => {
  const ai = getAI();

  const prompt = `
    You are an expert educational content extractor.
    Analyze the provided textbook (PDF).

    CRITICAL INSTRUCTION: GROUPING
    - Look for "Exercise" headings (e.g., "Exercise 1.1", "Exercise 3.4", "Questions").
    - Treat EACH "Exercise" or "Question Set" block as a SINGLE Learning Activity.
    - The 'title' MUST be the Heading (e.g., "Exercise 1.1").
    - The 'question' field must contain ALL the individual questions/problems listed under that exercise.
    - Do NOT split questions into separate items if they belong to the same Exercise header.
    
    For each identified item (Exercise group), extract:
    - A short title (e.g., "Exercise 1.1").
    - The full text of all questions in that group.
    - The chapter context.
    - The topic.
    - The page number (approximate is fine).
    - Determine the type (QA, MCQ, PRACTICE).
    - Estimate difficulty (easy, medium, hard).

    Return a JSON array of learning activities.
  `;

  const pdfPart = {
    inlineData: {
      mimeType: getMimeType(textbookBase64),
      data: textbookBase64.split(',')[1]
    }
  };

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: {
      parts: [
        { text: prompt },
        pdfPart
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            question: { type: Type.STRING },
            chapter: { type: Type.STRING },
            topic: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['QA', 'MCQ', 'PRACTICE'] },
            difficulty: { type: Type.STRING, enum: ['easy', 'medium', 'hard'] },
            pageNumber: { type: Type.INTEGER }
          },
          required: ["question", "type"]
        }
      }
    }
  });

  const text = response.text || "[]";
  const rawActivities = JSON.parse(text);

  // Map to LearningActivity interface
  return rawActivities.map((a: any) => ({
    id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    textbookId,
    title: a.title || 'Untitled Activity',
    question: a.question,
    chapter: a.chapter || null,
    topic: a.topic || null,
    type: a.type as 'QA' | 'MCQ' | 'PRACTICE',
    difficulty: a.difficulty || 'medium', // Default to medium if unknown
    pageNumber: a.pageNumber || null,
    status: 'PENDING'
  }));
};

// --- Activity Grading ---

export const gradeLearningActivity = async (
  activity: LearningActivity,
  studentImageBase64: string[]
): Promise<Partial<ActivitySubmission>> => {
  const ai = getAI();

  const prompt = `
    You are a friendly and encouraging tutor.
    Grade the student's answer to the following question.

    Question: ${activity.question}
    Topic: ${activity.topic || 'General'}
    
    Instructions:
    1. Analyze the student's handwritten answer in the provided image(s).
    2. Check for correctness.
    3. Provide constructive feedback. if incorrect, explain why.
    4. Assign a score out of 10.
    5. Be encouraging!

    Return JSON.
  `;

  const imageParts = studentImageBase64.map(img => ({
    inlineData: {
      mimeType: getMimeType(img),
      data: img.split(',')[1]
    }
  }));

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash-001",
    contents: {
      parts: [
        { text: prompt },
        ...imageParts
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER },
          feedback: { type: Type.STRING },
          isCorrect: { type: Type.BOOLEAN }
        },
        required: ["score", "feedback", "isCorrect"]
      }
    }
  });

  const text = response.text || "{}";
  const result = JSON.parse(text);

  return {
    score: result.score,
    maxScore: 10,
    feedback: result.feedback,
    isCorrect: result.isCorrect,
    attempts: 1
  };
};
