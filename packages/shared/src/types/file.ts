export type SupportedFileKind = 'text' | 'markdown' | 'pdf' | 'docx' | 'xlsx' | 'html' | 'url' | 'sitemap' | 'directory' | 'image' | 'unsupported';

export type FilePageText = {
  pageNumber: number;
  text: string;
};

export type ChatFileAttachment = {
  id: string;
  kind: SupportedFileKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  text?: string;
  pageTexts?: FilePageText[];
  dataUrl?: string;
  createdAt: string;
};

export type FileParseResult =
  | { ok: true; attachment: ChatFileAttachment }
  | { ok: false; reason: 'unsupported_type' | 'too_large' | 'parse_error'; message: string };
