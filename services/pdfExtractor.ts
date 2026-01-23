import * as pdfjsLib from 'pdfjs-dist';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';

// Use a verified stable CDN version (3.11.174 - confirmed working)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export interface ExtractedImage {
  pageNumber: number;
  imageData: string;
  url: string;
}

export interface PDFContent {
  text: string;
  images: ExtractedImage[];
}

export const extractPDFContent = async (
  pdfBase64: string,
  teacherId: string
): Promise<PDFContent> => {
  try {
    // Convert base64 to Uint8Array
    const base64Data = pdfBase64.includes('base64,')
      ? pdfBase64.split('base64,')[1]
      : pdfBase64;

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Load PDF
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;

    let fullText = '';
    const images: ExtractedImage[] = [];

    // Process each page - Extract text AND full page images
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);

      // Extract text
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .trim();

      if (pageText) {
        fullText += `\n\n[Page ${i}]\n${pageText}`;
      }

      // Render page to canvas to get image
      const viewport = page.getViewport({ scale: 1.5 }); // Good balance of quality/size
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (context) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        // Get base64 image
        const base64Image = canvas.toDataURL('image/jpeg', 0.85);

        // Upload to storage to get a permanent URL for the AI/Markdown
        // Note: Using a shorter path for tidiness
        const imageUrl = await uploadBase64ToStorage(base64Image, teacherId, `pdf_page_${i}_${Date.now()}`);

        images.push({
          pageNumber: i,
          imageData: base64Image,
          url: imageUrl
        });
      }
    }

    return { text: fullText, images };

  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract PDF content: ' + (error as Error).message);
  }
};

export const uploadBase64ToStorage = async (
  base64Data: string,
  teacherId: string,
  filename?: string
): Promise<string> => {
  const storage = getStorage();
  const storageRef = ref(
    storage,
    `note-images/${teacherId}/${filename || Date.now()}.png`
  );

  await uploadString(storageRef, base64Data, 'data_url');
  return await getDownloadURL(storageRef);
};
