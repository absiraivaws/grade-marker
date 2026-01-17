
import { GoogleGenAI, Type } from "@google/genai";
import { Assignment, AIResponse } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeAnswer = async (
  assignment: Assignment,
  studentAnswerBase64: string
): Promise<AIResponse> => {
  const ai = getAI();
  
  const markingCriteriaString = assignment.markingPoints
    .map((m, i) => `${i + 1}. ${m.point} (Weight: ${m.weight})`)
    .join("\n");

  const prompt = `
    You are a professional academic grader with expertise in STEM.
    
    Task: Grade the Student's Answer against the Marking Criteria based on the Teacher's Reference.
    
    Marking Criteria:
    ${markingCriteriaString}

    STRICT GRADING RULES FOR MATHEMATICS/PHYSICS:
    1. EXPLICIT FORMULA REQUIREMENT: If a marking point asks for "Stating the formula" (e.g., Δp = mv - mu or quadratic formula), the student MUST write the symbolic formula explicitly. If they skip the symbols and go straight to numerical substitution, you MUST NOT award the mark for stating the formula.
    2. SUBSTITUTION vs FORMULA: Correct numerical substitution proves understanding of the formula, but it DOES NOT satisfy a requirement to state the formula itself. These are two separate milestones.
    3. IMPLICIT IDENTIFICATION: If the student uses the correct numbers in the correct places in a formula, you may award points for "Identifying variables/coefficients" if that specific criterion is listed.
    4. REARRANGEMENT: If an equation is rearranged correctly within the flow of calculation, award points for rearrangement.
    5. ACCURACY: Check signs (+/-) and units carefully.
    6. JSON FORMAT: Your output must be valid JSON matching the schema. No paragraph feedback, just a short summary.
    7. CRITERIA MATCHING: The 'criteriasMet' array MUST match the exact order and length of the Marking Criteria provided.
  `;

  const teacherPart = assignment.teacherAnswerImage ? {
    inlineData: {
      mimeType: "image/png",
      data: assignment.teacherAnswerImage.split(',')[1]
    }
  } : { text: "Use marking criteria as the only reference." };

  const studentPart = {
    inlineData: {
      mimeType: "image/png",
      data: studentAnswerBase64.split(',')[1]
    }
  };

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        teacherPart,
        studentPart
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

export const extractMarkingPoints = async (imageUri: string): Promise<string[]> => {
  const ai = getAI();
  const prompt = "List the specific marking points from this solution (e.g., 'Correct formula', 'Substitution', 'Final answer'). Return as a JSON array of strings.";
  
  // Use generateContent for text extraction from images
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "image/png", data: imageUri.split(',')[1] } }
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
