# RAG Implementation Plan for School Management System

## Analysis: RAG vs Current Approach

### Your Current System:
- ✅ Direct file upload → Gemini AI (base64)
- ✅ Works well for small-medium documents
- ✅ Simple architecture (Firebase + Gemini)
- ❌ Limited to images/PDFs as base64
- ❌ Can't handle large textbooks or multiple sources
- ❌ No persistent knowledge base

### RAG Benefits:
- 📚 Handle massive documents (entire textbooks)
- 🔗 Multiple sources (YouTube, web, PDFs)
- 💰 Cost-efficient (only send relevant chunks)
- 📖 Source citation capability
- 🧠 Persistent "memory" across sessions

---

## Recommended Implementation Plan

### **Phase 1: Quick Wins (1-2 weeks)** 
*Improve current system without major architecture changes*

#### Actions:
1. **Add document parsing** (replace base64 with text extraction)
   - Install `pdf-parse` in your React app or Cloud Functions
   - Extract text from PDFs before sending to Gemini
   - This reduces token costs and improves context

2. **Support YouTube transcripts**
   - Add YouTube URL input field
   - Use `youtube-transcript-api` via Cloud Function
   - Append transcript to note generation context

3. **Structured output for slides**
   - Modify prompt to return JSON for slide structure
   - Add "Generate Slides" button that creates simple HTML slides
   - Later upgrade to PPTX

**Benefits:** Immediate improvement without changing architecture

---

### **Phase 2: Multi-Source Ingestion (2-3 weeks)**
*Add ability to combine multiple materials*

#### Architecture:
```
Teacher uploads:
  ├─ Textbook PDF
  ├─ YouTube lecture URL  
  ├─ Web article URL
  └─ Personal notes (text)
        ↓
  Cloud Function extracts all text
        ↓
  Combined context → Gemini
```

#### Implementation:
1. Create Firebase Cloud Function (Node.js or Python)
   ```typescript
   // functions/src/ingestMaterials.ts
   export const ingestMaterials = functions.https.onCall(async (data) => {
     const { pdfUrls, youtubeUrls, webUrls, textNotes } = data;
     
     let combinedText = "";
     
     // Extract from PDFs
     for (const url of pdfUrls) {
       const text = await extractPdfText(url);
       combinedText += `\n\n[PDF Source]\n${text}`;
     }
     
     // Get YouTube transcripts
     for (const url of youtubeUrls) {
       const transcript = await getYouTubeTranscript(url);
       combinedText += `\n\n[Video Source]\n${transcript}`;
     }
     
     return { extractedText: combinedText };
   });
   ```

2. Update UI to accept multiple source types

**Benefits:** Rich multi-modal learning materials without RAG complexity

---

### **Phase 3: RAG Implementation (4-6 weeks)**
*Only if you need to handle very large documents (500+ pages)*

#### When to implement:
- Teachers upload entire textbooks (>100MB)
- Need to reference materials across multiple note generations
- Want source citation ("According to Chapter 3...")

#### Tech Stack for Your Case:
```
Current: React → Firebase → Gemini
Add:     Python Microservice (Cloud Run/Cloud Functions)
         + Firestore (vector search capability)
```

#### Why NOT use separate vector DB:
- Firestore now supports [vector search](https://firebase.google.com/docs/firestore/vector-search) (beta)
- Keep everything in Firebase ecosystem
- No need for Pinecone/pgvector

#### Implementation:

1. **Cloud Function (Python) for chunking:**
   ```python
   # functions/chunk_and_embed.py
   from google.cloud import firestore
   from vertexai.language_models import TextEmbeddingModel
   
   def chunk_document(text: str, chunk_size: int = 1000):
       """Split into overlapping chunks"""
       chunks = []
       for i in range(0, len(text), chunk_size - 100):  # 100 char overlap
           chunks.append(text[i:i + chunk_size])
       return chunks
   
   def embed_and_store(doc_id: str, text: str):
       chunks = chunk_document(text)
       model = TextEmbeddingModel.from_pretrained("textembedding-gecko@003")
       
       db = firestore.Client()
       for idx, chunk in enumerate(chunks):
           embedding = model.get_embeddings([chunk])[0].values
           
           db.collection('note_chunks').add({
               'doc_id': doc_id,
               'chunk_index': idx,
               'text': chunk,
               'embedding': embedding  # Firestore vector field
           })
   ```

2. **Retrieval function:**
   ```python
   def retrieve_relevant_chunks(query: str, top_k: int = 5):
       model = TextEmbeddingModel.from_pretrained("textembedding-gecko@003")
       query_embedding = model.get_embeddings([query])[0].values
       
       db = firestore.Client()
       results = db.collection('note_chunks').find_nearest(
           vector_field='embedding',
           query_vector=query_embedding,
           limit=top_k
       )
       
       return [doc.to_dict()['text'] for doc in results]
   ```

3. **Update note generation:**
   ```typescript
   // Instead of sending full document
   const relevantChunks = await retrieveRelevantChunks(
     "Week 1: Introduction to Physics"
   );
   
   const prompt = `
   Using ONLY these source materials:
   ${relevantChunks.join('\n\n---\n\n')}
   
   Create study notes for Week 1...
   `;
   ```

---

### **Phase 4: PowerPoint Generation (2 weeks)**

#### Implementation:

1. **Modify Gemini prompt to return slide structure:**
   ```typescript
   const slidePrompt = `
   Convert these study notes into a 10-slide presentation structure.
   Return ONLY valid JSON:
   {
     "slides": [
       {
         "title": "Introduction to Physics",
         "bullets": ["Point 1", "Point 2"],
         "speakerNotes": "Explain the concept of motion..."
       }
     ]
   }
   `;
   ```

2. **Create PPTX using Cloud Function:**
   ```python
   # functions/generate_pptx.py
   from pptx import Presentation
   from pptx.util import Inches, Pt
   
   def create_slides(slides_json):
       prs = Presentation()
       
       for slide_data in slides_json['slides']:
           slide = prs.slides.add_slide(prs.slide_layouts[1])
           slide.shapes.title.text = slide_data['title']
           
           text_frame = slide.shapes.placeholders[1].text_frame
           for bullet in slide_data['bullets']:
               p = text_frame.add_paragraph()
               p.text = bullet
               p.level = 0
           
           # Add speaker notes
           notes_slide = slide.notes_slide
           notes_slide.notes_text_frame.text = slide_data['speakerNotes']
       
       return prs.save('output.pptx')
   ```

3. **Add download button in UI**

---

## Recommendation: Start with Phase 1 + 2

### Why:
- Your current Gemini integration already handles most use cases
- Gemini 1.5 Pro has 2M token context window (can fit entire textbooks!)
- RAG adds complexity you may not need yet
- Focus on **user experience** first (YouTube, multi-file support)

### Decision Point:
- If teachers mostly upload <50 pages → **Skip Phase 3**
- If they need 500+ page textbooks → **Implement Phase 3**

---

## Immediate Next Steps

1. **Add YouTube URL support** (1 day)
   - Add input field for YouTube URLs
   - Create Cloud Function to extract transcripts
   - Append transcript to note generation context

2. **Add text extraction from PDFs** (2 days)
   - Replace base64 approach with text extraction
   - Use `pdf-parse` library
   - Send clean text to Gemini instead of images

3. **Add "Generate Slides as JSON" feature** (1 day)
   - Modify prompt to return structured slide data
   - Create preview UI for slide structure

4. **Cloud Function for PPTX generation** (3 days)
   - Set up Python Cloud Function
   - Install `python-pptx`
   - Create endpoint that accepts JSON and returns .pptx file

---

## Tech Stack Summary

| Component | Recommended Tool | Why? |
| --- | --- | --- |
| **Backend API** | **Firebase Cloud Functions** | Already integrated, supports both Node.js and Python |
| **LLM Model** | **Gemini 1.5 Pro** (current) | 2M token context window, excellent for large documents |
| **Document Parsing** | **pdf-parse** (Node.js) or **PyPDF2** (Python) | Simple text extraction |
| **Video Transcripts** | **youtube-transcript-api** (Python) | Free, no video download required |
| **Web Scraping** | **cheerio** (Node.js) or **BeautifulSoup** (Python) | Extract main content from URLs |
| **Slide Generation** | **python-pptx** | Industry standard for programmatic PPTX creation |
| **Vector DB** | **Firestore Vector Search** (Phase 3 only) | Native Firebase integration, no separate service needed |
| **Embeddings** | **Vertex AI Text Embedding** (Phase 3 only) | Google's embedding model, integrates with Firestore |

---

## Cost Considerations

### Current (Base64 + Gemini):
- Image tokens are more expensive than text tokens
- Limited by file size for base64 encoding

### After Phase 1-2:
- **~60% cost reduction** by sending text instead of images
- Better context understanding from clean text
- Can handle larger documents

### Phase 3 (RAG):
- Initial setup cost for embeddings
- Ongoing: Only pay for relevant chunks
- **~80% cost reduction** for very large documents
- Better for repeated queries on same materials

---

## Migration Strategy

1. **Keep existing functionality** - Don't break current features
2. **Add new capabilities alongside** - YouTube, multi-file as optional features
3. **Gradual rollout** - Test with subset of teachers first
4. **Monitor usage** - Decide on Phase 3 based on real data
5. **Collect feedback** - Teachers will tell you what they need

---

## Success Metrics

- **User Adoption:** % of teachers using multi-source feature
- **Document Size:** Average size of uploaded materials
- **Cost per Note:** Token usage before/after optimization
- **Quality Score:** Teacher ratings on generated notes
- **Time Saved:** Teacher time from upload to usable material

---

## Questions to Answer Before Phase 3

1. What's the largest document teachers typically upload?
2. Do teachers reuse the same textbook for multiple lessons?
3. How often do they reference previous materials?
4. Do they need source citations in generated notes?
5. What's the budget for AI API calls?

If answers suggest large, reused materials → Phase 3 is worth it
If answers suggest small, one-time uploads → Phase 1-2 is sufficient
