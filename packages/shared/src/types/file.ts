export type SupportedFileKind = 'text' | 'markdown' | 'pdf' | 'image' | 'unsupported';

export type ChatFileAttachment = {
  id: string;
  kind: SupportedFileKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  text?: string;
  dataUrl?: string;
  createdAt: string;
};

export type FileParseResult =
  | { ok: true; attachment: ChatFileAttachment }
  | { ok: false; reason: 'unsupported_type' | 'too_large' | 'parse_error'; message: string };
