
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
    You are an expert academic grader. 
    Task: Grade the student's answer based on the Teacher's Reference Solution and the Marking Criteria provided.
    
    Marking Criteria:
    ${markingCriteriaString}

    Teacher's Reference Solution is provided as an image.
    Student's Answer is provided as an image.

    Compare them carefully. Be fair but firm. 
    If the student's handwriting is hard to read, do your best to transcribe it mentally.
    Provide a score and feedback for each criterion.
  `;

  // Prepare images
  const teacherPart = assignment.teacherAnswerImage ? {
    inlineData: {
      mimeType: "image/png",
      data: assignment.teacherAnswerImage.split(',')[1]
    }
  } : { text: "No reference image provided. Grade based on marking criteria only." };

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
    return JSON.parse(response.text || "{}") as AIResponse;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    throw new Error("AI grading failed to produce valid result.");
  }
};

export const extractMarkingPoints = async (imageUri: string): Promise<string[]> => {
  const ai = getAI();
  const prompt = "Look at this teacher's answer sheet. Extract a list of key marking points or rubrics that should be used to grade a student's answer. Return them as a simple list of strings.";
  
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

  return JSON.parse(response.text || "[]");
};
