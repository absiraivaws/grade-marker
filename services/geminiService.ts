
import { GoogleGenAI, Type } from "@google/genai";
import { Assignment, AIResponse } from "../types";
import { PACKAGES_DATA } from "./packagesData";

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
  previousCorrections?: string,
  extractedText?: string,
  pageImages?: Array<{ pageNumber: number; url: string; imageData?: string }>
): Promise<string> => {
  const ai = getAI();

  const prompt = `
You are an expert teacher and curriculum designer.
Your task: Deeply analyze the provided teaching materials and create a comprehensive, well-structured study note for students.

CRITICAL FORMATTING FOR PRESENTATION MODE:
- Use horizontal rules ('---') to separate distinct logical sections or "slides". 
- Each section between '---' should be a self-contained "slide" or topic.
- Ensure the first header of a section acts as the slide title.

Context:
Subject: ${context.subjectName}
Class: ${context.className}
${teacherPrompt ? `Teacher's Focus/Unit: ${teacherPrompt}` : ''}
${previousCorrections ? `Previous Teacher Feedback on Similar Notes:\n${previousCorrections}` : ''}
${extractedText ? `\n\nExtracted Text Content:\n${extractedText.substring(0, 200000)}` : ''}
${pageImages ? `\n\nAvailable page images: ${pageImages.map(p => `Page ${p.pageNumber}`).join(', ')}` : ''}

AVAILABLE TOOLS & PACKAGES:
The following tools are known to the system. You may reference them or use their syntax where applicable (specifically KaTeX for math and Mermaid for diagrams). For other specialized needs (Chemistry, Physics), mention the recommended tool if relevant, but use text descriptions or Mermaid if possible.
${JSON.stringify(PACKAGES_DATA.map(p => `- ${p["Tool / Package"]} (${p.Subject || 'General'}): ${p["Type / Description"]}`), null, 2)}

CRITICAL INSTRUCTIONS FOR VISUAL ELEMENTS:

1. ANIMATED REACTIONS - Use the 'reaction' code block for step-by-step equations:
   - Use for chemical equations, math steps, or logical flows.
   - Use standard operators: +, ->, =, arrows.
   - Format:
   \`\`\`reaction
   HCl + NaOH -> NaCl + H2O
   \`\`\`

2. ORGANIC STRUCTURES - Use the 'smiles' code block for 2D molecules:
   - Use for organic chemistry, isomers, or complex structures.
   - Provide the standard SMILES string.
   - Example:
   \`\`\`smiles
   CC(=O)O
   \`\`\`

3. FORMULAS & EQUATIONS - Use LaTeX syntax for static math:
   
   BLOCK FORMULAS (display mode) - wrap in $$...$$:
   $$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$
   
   INLINE FORMULAS - wrap in $...$ (no line breaks):
   The formula $E = mc^2$ shows energy-mass equivalence.
   
   FRACTIONS: Use \\frac{numerator}{denominator}
   Example: $$\\frac{1}{10}$$ or $$\\frac{7}{100}$$

   VERTICAL MATH (Addition/Subtraction):
   Use generic 'array' with simple alignment (r for right).
   Example:
   $$
   \\begin{array}{r}
     2.57 \\\\
   +\\, 1.68 \\\\
   \\hline
     4.25
   \\end{array}
   $$
   (Avoid complex column specifications like @{\\quad} which may break rendering)
   
   OPERATORS: Use \\times for ×, \\div for ÷, \\pm for ±
   Example: $$a \\times b = c$$ or $$12 \\div 4 = 3$$
   
   MULTIPLE EQUATIONS (aligned):
   $$\\begin{aligned}
   2.57 + 1.68 &= 4.25 \\\\
   12.70 - 8.53 &= 4.17
   \\end{aligned}$$
   
   IMPORTANT: For inline math, NEVER use $$. Only use $ for inline.
   IMPORTANT: Escape backslashes properly: \\frac not \frac

2. DIAGRAMS & FLOWCHARTS - CRITICAL: Use simple, error-free Mermaid syntax
   
   MANDATORY FORMAT - Always wrap in code fences:
   \`\`\`mermaid
   [diagram code here]
   \`\`\`
   
   SAFE FLOWCHART SYNTAX (use flowchart TD or LR):
   \`\`\`mermaid
   flowchart TD
       A[Start] --> B[Step 1]
       B --> C{Decision?}
       C -->|Yes| D[Option A]
       C -->|No| E[Option B]
   \`\`\`
   
   SAFE PIE CHART SYNTAX:
   \`\`\`mermaid
   pie
       title Parts of Number
       "Tenths" : 10
       "Hundredths" : 1
       "Rest" : 89
   \`\`\`
   
   SAFE GRAPH SYNTAX (for simple relationships):
   \`\`\`mermaid
   graph TD
       A[Decimal Number]
       B[Whole Part]
       C[Decimal Part]
       A --> B
       A --> C
       B --> D[Tens]
       B --> E[Ones]
       C --> F[Tenths]
       C --> G[Hundredths]
   \`\`\`
   
   AVOID:
   - Double parentheses like ((.))
   - Complex style commands
   - Special characters in labels
   - Nested structures
   
   RULES:
   - Use simple node shapes: [] for rectangles, {} for diamonds
   - Keep labels simple and short
   - Use --> for arrows
   - One statement per line
   \`\`\`mermaid
   pie title Parts of a Whole
       "Tenths: 0.1" : 10
       "Hundredths: 0.01" : 1
       "Remaining" : 89
   \`\`\`
   
   Class diagram example (for relationships, hierarchies):
   \`\`\`mermaid
   classDiagram
       Number <|-- Decimal
       Number <|-- Fraction
       Decimal : +wholeNumber
       Decimal : +tenths
       Decimal : +hundredths
       Decimal: +compare()
   \`\`\`

3. CHARTS & GRAPHS - Create meaningful visual representations:
   Use Mermaid to show relationships, comparisons, hierarchies
   
4. EMBEDDED IMAGES (CRITICAL):
   The user wants to see the actual diagrams/images from the source PDF.
   
   - Look at the provided PDF pages.
   - If a page contains a relevant diagram, chart, or illustration, YOU MUST EMBED IT.
   - **AUTO-CROP**: Identify the specific region of the diagram.
     - Return the bounding box coordinates in the format: \`ymin, xmin, ymax, xmax\` (scale 1-1000).
   - Use the syntax: \`[IMAGE:Page X | ymin, xmin, ymax, xmax]\`
     - Example: \`[IMAGE:Page 3 | 150, 200, 500, 800]\` (This crops to the specific diagram).
     - If the WHOLE page is the diagram, use \`[IMAGE:Page X]\`.
     
   - Example Context:
     "As shown in the diagram below:
     [IMAGE:Page 3|150,100,450,900]
     Figure: The structure of the cell."
   
   - Do NOT create a Mermaid diagram if the source image is complex and better suited for direct display.
   
5. CLASS DIAGRAMS & FLOWCHARTS (Specific Request):
   
5. CLASS DIAGRAMS & FLOWCHARTS (Specific Request):
   Use standard Mermaid \`classDiagram\` syntax. For hierarchies, use \`classDiagram\`. For processes, use \`flowchart TD\`.
   CRITICAL: Wrap all node labels containing spaces or special characters (like (), [], {}, .) in double quotes to prevent syntax errors. Example: \`id["Label (Text)"]\`.
   
   Hierarchy Example:
   \`\`\`mermaid
   classDiagram
   Quadrilateral <|-- Trapezium
   Quadrilateral <|-- Parallelogram
   Parallelogram <|-- Rhombus
   class Trapezium {
   +"One pair (sides)"
   }
   \`\`\`

   Process Example:
   \`\`\`mermaid
   flowchart TD
   A[Start] --> B["Process (Step 1)"]
   B --> C[End]
   \`\`\`

CONTENT STRUCTURE:
1. Main title (# Title)
2. Learning Objectives (bullet list)
3. Key Concepts with explanations
4. Visual elements (formulas, diagrams, charts)
5. Worked Examples with step-by-step solutions
6. Important formulas in LaTeX
7. Summary/Key Takeaways
8. Practice Tips

Use markdown formatting:
- # for main title
- ## for sections
- ### for subsections
- **bold** for emphasis
- - for bullet points
- > for important notes
- Tables with | syntax
- Code blocks with \`\`\`

Create a comprehensive, student-friendly study note with rich visual elements (especially dense Mermaid diagrams for structural concepts):
  `;


  const noteParts = noteFilesBase64.map(file => ({
    inlineData: {
      mimeType: getMimeType(file),
      data: file.split(',')[1]
    }
  }));

  // Create explicit visual parts for each page if available
  const visualPageParts = (pageImages || [])
    .filter(p => p.imageData)
    .flatMap(p => [
      { text: `[VISUAL CONTEXT] Page ${p.pageNumber}:` },
      {
        inlineData: {
          mimeType: "image/jpeg", // Assuming canvas toDataURL uses jpeg/png
          data: p.imageData!.split(',')[1]
        }
      }
    ]);

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      role: 'user',
      parts: [
        { text: prompt },
        ...noteParts, // Keep original PDF just in case
        ...visualPageParts // Explicitly add page snapshots
      ] as any[]
    } as any
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
  1. ORIGINAL(before teacher edits)
  2. CORRECTED(after teacher review and edits)

Analyze the differences and create a concise summary of what the teacher corrected or improved.
Focus on:
  - Content accuracy improvements
    - Clarity enhancements
      - Structure / organization changes
        - Added or removed concepts
          - Examples or explanations that were revised

Return a 2 - 3 sentence summary of the key corrections / improvements.
Be specific about what was changed and why it matters for future note generation.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        { text: `ORIGINAL: \n${originalContent} ` },
        { text: `CORRECTED: \n${correctedContent} ` }
      ]
    }
  });

  return response.text || 'Teacher made corrections to improve clarity and accuracy.';
};

export const applyNoteCorrection = async (
  currentNoteContent: string,
  correctionPrompt: string,
  correctionImages?: string[], // Base64 images
  correctionImageUrls?: string[] // Public URLs
): Promise<string> => {
  const ai = getAI();

  const prompt = `
You are an expert teaching content editor with expertise in creating visual educational materials.

Current Note Content:
${currentNoteContent}

Teacher's Correction Request:
${correctionPrompt}

${correctionImageUrls && correctionImageUrls.length > 0 ? `
ATTACHED IMAGES:
The teacher has uploaded images to be used in this correction.
${correctionImageUrls.map((url, i) => `Image ${i + 1}: ${url}`).join('\n')}

CRITICAL INSTRUCTION FOR IMAGES:
- The teacher wants these exact images inserted.
- You MUST use the provided URLs directly.
- To insert Image 1, write EXACTLY: ![Figure](${correctionImageUrls[0]})
- Do NOT use placeholders like [Image] or [Figure].
- Do NOT omit the image.
` : ''}
  Task: Carefully read the teacher's correction request and modify the note accordingly.
  
  IF IMAGES ARE PROVIDED:
  - The teacher has attached images to this request.
  - Use them to update the content (e.g., descriptions, creating Mermaid diagrams from them, or answering questions based on them).

VISUAL ELEMENT INSTRUCTIONS(Use these when adding new content):
${currentNoteContent.substring(0, 100000)} // Truncate if too large, but usually fine

Rules:
1. Preserve all existing content unless explicitly asked to modify it
2. Maintain markdown format and structure
3. Use LaTeX for any math formulas
4. Use Mermaid for any diagrams, flowcharts, or charts
5. Add new content in the appropriate section as requested
6. If a section doesn't exist, create it with proper hierarchy (##, ###)
7. Keep the tone and style consistent with the rest of the note
8. Return ONLY the complete modified markdown note, nothing else

Modified Note:
`;

  const imageParts = (correctionImages || []).map(img => ({
    inlineData: {
      mimeType: getMimeType(img),
      data: img.split(',')[1]
    }
  }));

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      role: 'user',
      parts: [
        { text: prompt },
        ...imageParts
      ] as any[]
    } as any
  });

  return response.text || currentNoteContent;
};

export const extractModuleTitle = async (noteContent: string): Promise<string> => {
  const ai = getAI();

  const prompt = `
You are an expert at analyzing educational content and extracting module/chapter information.

Analyze this study note content and extract or generate an appropriate module title:

${noteContent.substring(0, 3000)}

Task: Determine the module/chapter/unit title for this content.

Look for:
1. Explicit module numbers (Module 1, Module 2, Chapter 1, Unit 1, etc.)
2. Main topic/theme that could serve as a title
3. First heading or main title in the content

Return a concise module title in one of these formats:
- "Module X: Topic Name" (if module number is clear)
- "Chapter X: Topic Name" (if chapter number is clear)
- "Unit X: Topic Name" (if unit number is clear)
- "Topic Name" (if no module number is found)

Examples:
- "Module 1: Introduction to Photosynthesis"
- "Chapter 3: Newton's Laws of Motion"
- "Unit 2: Cell Structure and Function"
- "Introduction to Algebra"

Return ONLY the title, nothing else.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [{ text: prompt }]
    }
  });

  const title = response.text?.trim() || 'Untitled Module';
  return title;
};
