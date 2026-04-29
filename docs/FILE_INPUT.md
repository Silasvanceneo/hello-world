# File Input

P0-M5 supports basic local file preparation before provider submission.

## Supported P0 file types

- TXT
- Markdown
- PDF with a simple text layer
- PNG/JPG/WebP images

## Implemented behavior

- Detect file kind from MIME type and filename.
- Parse TXT/Markdown as UTF-8 text.
- Extract simple PDF text-layer strings without adding a heavy dependency.
- Convert images to data URLs for vision-capable providers.
- Attach/remove files from chat sessions immutably.
- Return user-readable guidance when the selected model lacks file or vision support.

## Limitations

The PDF parser is intentionally lightweight for P0. Scanned PDFs, compressed streams, OCR, DOCX/XLSX/PPTX, and citation-grade page mapping are P1+ work.
