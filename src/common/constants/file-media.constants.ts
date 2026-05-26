/**
 * Shared file/media limits and type allowlists.
 * Keep in sync with companii-web/src/constants/fileMedia.constants.ts
 */
export const FILE_MEDIA_LIMITS = {
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 150 * 1024 * 1024,
  maxBatchCount: 10,
  maxGalleryVideos: 2,
  maxVideoDurationSeconds: 120,
  /** Multer hard limit — per-type checks happen in FilesValidationService. */
  uploadMaxBytes: 150 * 1024 * 1024,
} as const;

export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const;

export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm'] as const;

export const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx'] as const;

export const ALLOWED_UPLOAD_EXTENSIONS = new Set<string>([
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
]);

export const VIDEO_EXTENSION_SET = new Set<string>(VIDEO_EXTENSIONS);
