
import { GoogleGenAI, Type } from "@google/genai";
import { Assignment, AIResponse } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const getMimeType = (base64: string): string => {
  const match = base64.match(/^data:([^;]+);/);
  return match ? match[1] : "image/png";
};

export const analyzeAnswer = async (
  assignment: Assignment,
  studentAnswerImages: string[]
): Promise<AIResponse> => {
  const ai = getAI();
  
  const markingCriteriaString = assignment.markingPoints
    .map((m, i) => `${i + 1}. ${m.point} (Weight: ${m.weight})`)
    .join("\n");

  const prompt = `
    You are a professional academic grader with expertise in STEM.
    
    Task: Grade the Student's Answer (which may consist of multiple files/images provided in order) against the Marking Criteria based on the Teacher's Reference (also potentially multiple files/images).
    
    Marking Criteria:
    ${markingCriteriaString}

    STRICT GRADING RULES:
    1. SEQUENTIAL REVIEW: The files provided for both student and teacher are in logical order. Review them as a continuous piece of work.
    2. EXPLICIT FORMULA REQUIREMENT: If a marking point asks for "Stating the formula", the student MUST write the symbolic formula explicitly.
    3. SUBSTITUTION vs FORMULA: Correct numerical substitution DOES NOT satisfy a requirement to state the formula itself.
    4. ACCURACY: Check signs (+/-) and units carefully.
    5. JSON FORMAT: Output must be valid JSON matching the schema.
  `;

  const teacherParts = assignment.teacherAnswerImages?.map(img => ({
    inlineData: {
      mimeType: getMimeType(img),
      data: img.split(',')[1]
    }
  })) || [{ text: "Use marking criteria as the only reference." }];

  const studentParts = studentAnswerImages.map(img => ({
    inlineData: {
      mimeType: getMimeType(img),
      data: img.split(',')[1]
    }
  }));

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        ...teacherParts,
        ...studentParts
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          totalPossible: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
          criteriasMet: { 
            type: Type.ARRAY,
            items: { type: Type.BOOLEAN }
          }
        },
        required: ["score", "totalPossible", "feedback", "criteriasMet"]
      }
    }
  });

  try {
    const text = response.text || "{}";
    return JSON.parse(text) as AIResponse;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    throw new Error("AI grading failed.");
  }
};

export const extractMarkingPoints = async (images: string[]): Promise<string[]> => {
  const ai = getAI();
  const prompt = "Look at these solution files (images/PDFs) provided in order and list the specific marking points (e.g., 'Correct formula', 'Substitution', 'Final answer'). Return as a JSON array of strings.";
  
  const imageParts = images.map(img => ({
    inlineData: { 
      mimeType: getMimeType(img), 
      data: img.split(',')[1] 
    }
  }));

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        ...imageParts
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  const text = response.text || "[]";
  return JSON.parse(text);
};
