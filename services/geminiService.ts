
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

  // Use base64 data if available, otherwise fallback to text
  const teacherParts = assignment.teacherAnswerImagesBase64 && assignment.teacherAnswerImagesBase64.length > 0
    ? assignment.teacherAnswerImagesBase64.map(img => ({
      inlineData: {
        mimeType: getMimeType(img),
        data: img.split(',')[1]
      }
    }))
    : [{ text: "Use marking criteria as the only reference." }];

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

export interface NoteSectionDraft {
  title: string;
  question: string;
  markingPoints: { point: string; weight: number }[];
}

export interface NoteAnalysisResult {
  noteSummary: string;
  sections: NoteSectionDraft[];
}

export const analyzeTeachingNote = async (
  noteFilesBase64: string[],
  context: { subjectName: string; className: string },
  teacherPrompt?: string
): Promise<NoteAnalysisResult> => {
  const ai = getAI();

  const prompt = `
    You are an expert teacher assistant.
    Analyze the provided teaching note (PDF/images). Summarize the note for teacher review and then split it into clear instructional sections.
    For each section, create a draft assignment with:
    - title: short, specific
    - question: clear student-facing prompt
    - markingPoints: 3-6 criteria, each with { point, weight } where weight is an integer.

    Context:
    Subject: ${context.subjectName}
    Class: ${context.className}

    Return JSON strictly matching the schema.

    Additional teacher prompt (optional):
    ${teacherPrompt || 'None'}
  `;

  const noteParts = noteFilesBase64.map(file => ({
    inlineData: {
      mimeType: getMimeType(file),
      data: file.split(',')[1]
    }
  }));

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        ...noteParts
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          noteSummary: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                question: { type: Type.STRING },
                markingPoints: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      point: { type: Type.STRING },
                      weight: { type: Type.NUMBER }
                    },
                    required: ["point", "weight"]
                  }
                }
              },
              required: ["title", "question", "markingPoints"]
            }
          }
        },
        required: ["noteSummary", "sections"]
      }
    }
  });

  try {
    const text = response.text || "{}";
    return JSON.parse(text) as NoteAnalysisResult;
  } catch (e) {
    console.error("Failed to parse note analysis response", e);
    throw new Error("AI note analysis failed.");
  }
};

export const createEnhancedNote = async (
  noteFilesBase64: string[],
  context: { subjectName: string; className: string },
  teacherPrompt?: string,
  previousCorrections?: string
): Promise<string> => {
  const ai = getAI();

  const prompt = `
You are an expert teacher and curriculum designer.
Your task: Deeply analyze the provided teaching materials (PDFs, textbooks, guides, images, etc.) and create a comprehensive, well-structured study note for students.

Context:
Subject: ${context.subjectName}
Class: ${context.className}
${teacherPrompt ? `Teacher's Focus/Unit: ${teacherPrompt}` : ''}
${previousCorrections ? `Previous Teacher Feedback on Similar Notes:\n${previousCorrections}` : ''}

Instructions:
1. Thoroughly analyze all uploaded materials in sequence
2. Synthesize key concepts, explanations, examples, and learning objectives
3. For any diagrams, charts, tables, or visual elements: describe them clearly in text format using [DIAGRAM: description], [CHART: description], [FIGURE: description], etc.
4. Organize the note with clear hierarchical structure:
   - Main title
   - Learning Objectives (bullet list)
   - Key Concepts (with explanations)
   - Worked Examples with step-by-step solutions
   - Important Formulas or Rules (if applicable)
   - Visual Element Descriptions (from the materials)
   - Summary/Key Takeaways
   - Practice Tips for Students
5. Use markdown formatting:
   - # for main title
   - ## for sections
   - ### for subsections
   - **bold** for emphasis
   - - for bullet points
   - > for important notes
6. If the teacher specified a unit/topic, focus deeply on that content
7. Draw connections between concepts when relevant
8. Include real-world applications when applicable
9. Make it accessible to the specified class level
10. Return ONLY the complete markdown-formatted note content, no additional text

Create a comprehensive, student-friendly study note:
  `;

  const noteParts = noteFilesBase64.map(file => ({
    inlineData: {
      mimeType: getMimeType(file),
      data: file.split(',')[1]
    }
  }));

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        ...noteParts
      ]
    }
  });

  return response.text || '';
};

export const extractCorrectionSummary = async (
  originalContent: string,
  correctedContent: string
): Promise<string> => {
  const ai = getAI();

  const prompt = `
You are a curriculum analysis expert. 
Two versions of a teaching note are provided:
1. ORIGINAL (before teacher edits)
2. CORRECTED (after teacher review and edits)

Analyze the differences and create a concise summary of what the teacher corrected or improved.
Focus on:
- Content accuracy improvements
- Clarity enhancements
- Structure/organization changes
- Added or removed concepts
- Examples or explanations that were revised

Return a 2-3 sentence summary of the key corrections/improvements.
Be specific about what was changed and why it matters for future note generation.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        { text: `ORIGINAL:\n${originalContent}` },
        { text: `CORRECTED:\n${correctedContent}` }
      ]
    }
  });

  return response.text || 'Teacher made corrections to improve clarity and accuracy.';
};

export const applyNoteCorrection = async (
  currentNoteContent: string,
  correctionPrompt: string
): Promise<string> => {
  const ai = getAI();

  const prompt = `
You are an expert teaching content editor.

Current Note Content:
${currentNoteContent}

Teacher's Correction Request:
${correctionPrompt}

Task: Carefully read the teacher's correction request and modify the note accordingly.

Rules:
1. Preserve all existing content unless explicitly asked to modify it
2. Maintain the same markdown format and structure
3. Add new content in the appropriate section as requested
4. If a section doesn't exist, create it with proper hierarchy
5. Keep the tone and style consistent with the rest of the note
6. Return ONLY the complete modified markdown note, nothing else

Modified Note:
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt }
      ]
    }
  });

  return response.text || currentNoteContent;
};
