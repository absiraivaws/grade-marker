# 🖼️ Image Display Troubleshooting Guide

## ✅ Latest Fix Applied (Jan 19, 2026)

The image replacement system has been updated with:
- **Better regex matching** - Handles all format variations
- **Console logging** - Debug output to see what's happening
- **Explicit AI instructions** - AI now generates exact format: `[IMAGE:page_1]`

---

## 🔍 How to Debug Image Issues

### Step 1: Check Browser Console

When you generate a note, open browser console (F12) and look for these messages:

```
Available page images: [1, 5, 7, 12]
Note content length: 8543
Replaced 1 occurrences of page 1 image markers
Replaced 1 occurrences of page 5 image markers
```

### Step 2: Interpret the Output

**✅ Good Output:**
```
Available page images: [1, 2, 3, 4, 5]
Replaced 1 occurrences of page 1 image markers
```
→ Images extracted and replaced successfully

**❌ Problem: No images extracted**
```
Available page images: []
```
→ **Cause**: PDF extraction failed or PDF has no pages
→ **Solution**: Re-upload the PDF, ensure it's a valid PDF file

**❌ Problem: No replacements**
```
Available page images: [1, 5, 12]
Note content length: 8543
(No "Replaced X occurrences" messages)
```
→ **Cause**: AI didn't generate image markers in the note
→ **Solution**: Add explicit image references in your prompt (see below)

---

## 📝 How to Force Images in Generated Notes

### Option 1: Explicit Prompt (Recommended)

Add this to your "Additional Instructions":

```
IMPORTANT: Include textbook images throughout the note.

Reference these specific images:
- [IMAGE:page_1] - Introduction visual/block diagram
- [IMAGE:page_5] - Place value chart
- [IMAGE:page_7] - Comparison example
- [IMAGE:page_12] - Addition/subtraction steps

After each [IMAGE:page_X] marker, add a descriptive caption in italics.
```

### Option 2: Manual Insertion

If the AI forgets to add images, you can manually insert them:

1. Click "Edit" on the generated note
2. Find where an image should go
3. Type: `[IMAGE:page_5]` (replace 5 with your page number)
4. Add caption: `*Figure: Place value chart showing decimal positions*`
5. Click "Save Note" - the marker will be replaced automatically!

---

## 🎯 Understanding the Image System

### How It Works:

1. **PDF Upload** → System extracts all pages as images
2. **Upload to Firebase** → Each page gets a unique URL
3. **AI Generation** → AI writes `[IMAGE:page_5]` in the note
4. **Replacement** → System converts markers to actual images
5. **Display** → You see the real textbook images

### Supported Formats (All work now):

```
[IMAGE:page_1]   ← Standard format (recommended)
[IMAGE:page 1]   ← With space (works)
[Image:page_1]   ← Lowercase (works)
[IMAGE:page1]    ← No underscore (works)
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "Available page images: []"

**Problem**: No images were extracted from PDF

**Possible Causes**:
- PDF is text-only (no visual content)
- PDF extraction failed due to corruption
- Network error during upload

**Solutions**:
1. Re-upload the PDF
2. Try a different PDF
3. Check browser console for errors
4. Ensure Firebase Storage is configured correctly

### Issue 2: Images show but are blurry

**Problem**: Low-resolution extraction

**Solution**: This is normal for very large PDFs. The system extracts at 2x scale for balance between quality and file size. If you need higher quality:
- Use PDFs with higher quality source images
- The rendering scale can be adjusted in `pdfExtractor.ts` (line ~40)

### Issue 3: Image markers not replaced

**Problem**: See `[IMAGE:page_5]` as text in the note

**Possible Causes**:
- JavaScript error during replacement
- Incorrect format (though now all formats work)
- pageImages array is empty

**Solutions**:
1. Check console for "Available page images" log
2. If empty, re-generate the note
3. If not empty but no replacements, check for JS errors in console
4. Try manually editing and re-saving the note

### Issue 4: Wrong images appear

**Problem**: Image from page 5 shows content from page 3

**Cause**: PDF pages were reordered during extraction

**Solution**: 
- Check the original PDF page numbering
- Use the correct page number from the console log
- PDF extraction respects document page order, not printed page numbers

---

## 🔧 Advanced: Manual Image URLs

If you want to bypass the marker system entirely, you can use direct markdown:

```markdown
![Description](https://firebasestorage.googleapis.com/.../page_5.png)
```

But this is NOT recommended because:
- URLs are hard to manage
- Auto-replacement is more convenient
- Links may break if storage changes

---

## ✅ Verification Checklist

Before reporting an issue, verify:

- [ ] PDF uploaded successfully (check "Uploaded X files" message)
- [ ] "Create Enhanced Note" button clicked (not just file uploaded)
- [ ] Waited for generation to complete (loading spinner disappeared)
- [ ] Checked browser console for logs
- [ ] Used proper prompt with image references
- [ ] Tried regenerating the note once more
- [ ] Tested with a different PDF

---

## 📞 Still Having Issues?

If images still don't show after following this guide:

1. **Check console logs** - Look for specific error messages
2. **Try test PDF** - Use a simple 2-3 page PDF with clear images
3. **Clear cache** - Refresh browser with Ctrl+Shift+R
4. **Different browser** - Test in Chrome/Firefox/Edge
5. **Firebase permissions** - Ensure Storage rules allow reads

**Console commands for debugging:**

Open browser console (F12) and run:

```javascript
// Check if PDF extraction is working
console.log('PDF Extractor loaded:', typeof extractPDFContent !== 'undefined');

// Check Firebase Storage
console.log('Firebase configured:', firebase.apps.length > 0);
```

---

**Last Updated**: Jan 19, 2026
**Status**: ✅ Image system fully functional with comprehensive format support
