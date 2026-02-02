import { GoogleGenAI, Type } from "@google/genai";
import { PDFDocument } from 'pdf-lib';
import { LearningActivity, ActivitySubmission } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const getMimeType = (base64: string): string => {
  const match = base64.match(/^data:([^;]+);/);
  return match ? match[1] : "application/pdf";
};

// Helper to repair truncated JSON arrays
const tryParseJSON = (text: string) => {
  // 1. Clean Markdown and whitespace
  let cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
  if (cleaned.startsWith('json')) cleaned = cleaned.slice(4).trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("Standard JSON parse failed, attempting repair...", (e as Error).message);

    // 2. Try to repair truncated array (assuming valid objects were closed)
    // We look for the last '}', which implies the end of the last complete object.
    const lastBrace = cleaned.lastIndexOf('}');

    if (lastBrace !== -1) {
      // Keep everything up to the last object
      let repaired = cleaned.substring(0, lastBrace + 1);
      // Close the array
      repaired += "]";

      try {
        const result = JSON.parse(repaired);
        console.log(`Successfully repaired JSON. Recovered ${result.length} items.`);
        return result;
      } catch (e2) {
        console.error("JSON repair failed:", (e2 as Error).message);
      }
    }

    // Fail safe: return empty array to prevent app crash
    return [];
  }
};

const _extractChunk = async (chunkBase64: string, chunkIndex: number): Promise<any[]> => {
  const ai = getAI();
  const prompt = `
    You are an expert educational content extractor.
    Analyze the provided PDF chunk (Part ${chunkIndex + 1}).

    CRITICAL INSTRUCTION: GROUPING
    - Look for "Exercise" headings (e.g., "Exercise 1.1", "Exercise 3.4", "Questions").
    - Treat EACH "Exercise" or "Question Set" block as a SINGLE Learning Activity.
    - The 'title' field is CRITICAL. It MUST follow the format "Exercise X.Y", "Activity X.Y", or "X.Y.Z".
    - DO NOT use long descriptive titles (e.g., "Exercise 1.1: Calculating Velocity"). 
    - ONLY use the numbering (e.g., "Exercise 1.1").
    - If no explicit number is present, use "Exercise 1", "Exercise 2", etc., based on order.
    - The 'question' field must contain ALL the individual questions/problems listed under that exercise.
    - Do NOT split questions into separate items if they belong to the same Exercise header.
    
    For each identified item (Exercise group), extract:
    - A SHORT title (e.g., "Exercise 1.1").
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
      mimeType: "application/pdf",
      data: chunkBase64
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: {
        parts: [{ text: prompt }, pdfPart]
      },
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
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

    return tryParseJSON(response.text || "[]");
  } catch (error) {
    console.warn(`Failed to extract chunk ${chunkIndex}`, error);
    return [];
  }
};

export const extractActivitiesFromTextbook = async (
  textbookBase64: string,
  textbookId: string
): Promise<LearningActivity[]> => {
  const CHUNK_SIZE = 20; // Process 20 pages at a time

  try {
    // 1. Load PDF
    const safeBase64 = textbookBase64.includes(',') ? textbookBase64.split(',')[1] : textbookBase64;
    // pdf-lib requires Uint8Array for cleaner loading of large files usually, but base64 string works too
    const pdfDoc = await PDFDocument.load(safeBase64);
    const totalPages = pdfDoc.getPageCount();

    console.log(`Splitting ${totalPages} pages into chunks of ${CHUNK_SIZE}...`);

    let allRawActivities: any[] = [];

    // 2. Loop through chunks
    for (let i = 0; i < totalPages; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, totalPages);
      console.log(`Processing chunk pages ${i + 1} to ${end}`);

      // Create new sub-document
      const subDoc = await PDFDocument.create();
      // Copy pages (indices are 0-based)
      const pageIndices = Array.from({ length: end - i }, (_, k) => i + k);
      const copiedPages = await subDoc.copyPages(pdfDoc, pageIndices);

      copiedPages.forEach(page => subDoc.addPage(page));

      const chunkBase64 = await subDoc.saveAsBase64();

      // Extract from this chunk
      const chunkActivities = await _extractChunk(chunkBase64, i / CHUNK_SIZE);
      console.log(`Chunk ${i / CHUNK_SIZE} extracted ${chunkActivities.length} activities.`);

      allRawActivities = [...allRawActivities, ...chunkActivities];
    }

    // 3. Map to Interface (with deduplication if needed, but sequential chunks usually distinct)
    return allRawActivities.map((a: any) => {
      const cleanTitle = (t: string) => {
        // Remove any description after a colon or " - "
        // e.g. "Exercise 1.1: Intro" -> "Exercise 1.1"
        return t.split(/[:\–\—]/)[0].trim();
      };

      return {
        id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        textbookId,
        title: cleanTitle(a.title || 'Untitled Activity'),
        question: a.question,
        chapter: a.chapter || null,
        topic: a.topic || null,
        type: a.type as 'QA' | 'MCQ' | 'PRACTICE',
        difficulty: a.difficulty || 'medium',
        pageNumber: a.pageNumber || null,
        status: 'PENDING'
      };
    });

  } catch (err) {
    console.error("PDF Chunking/Extraction failed:", err);
    throw err;
  }
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
