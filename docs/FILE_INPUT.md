# File Input

P0-M5 supports basic local file preparation before provider submission.

## Supported file types

- TXT
- Markdown
- PDF with a simple text layer
- DOCX with basic `word/document.xml` text extraction
- XLSX with basic shared-string and worksheet value extraction
- PNG/JPG/WebP images

## Implemented behavior

- Detect file kind from MIME type and filename.
- Parse TXT/Markdown as UTF-8 text.
- Extract simple PDF text-layer strings and basic page text references without adding a heavy dependency.
- Extract basic DOCX/XLSX text from OpenXML zip entries.
- Convert images to data URLs for vision-capable providers.
- Attach/remove files from chat sessions immutably.
- Return user-readable guidance when the selected model lacks file or vision support.

## Limitations

The parsers are intentionally lightweight. Scanned PDFs, advanced compressed PDF streams, OCR, PPTX, formulas, formatting fidelity, and vector retrieval are later work.
