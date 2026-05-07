import { diskStorage, Options } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const ensureUploadDirectory = (relativeDirectory: string): string => {
  const uploadDirectory = join(process.cwd(), 'uploads', relativeDirectory);
  if (!existsSync(uploadDirectory)) {
    mkdirSync(uploadDirectory, { recursive: true });
  }
  return uploadDirectory;
};

const sanitizeFileName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export const createMulterOptions = (
  relativeDirectory: string,
  allowedMimeTypes: string[],
  maxSizeInBytes: number,
): Options => ({
  storage: diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, ensureUploadDirectory(relativeDirectory));
    },
    filename: (_req, file, callback) => {
      const fileExtension = extname(file.originalname);
      const fileName = sanitizeFileName(file.originalname.replace(fileExtension, '')) || 'file';
      callback(null, `${Date.now()}-${fileName}${fileExtension.toLowerCase()}`);
    },
  }),
  limits: {
    fileSize: maxSizeInBytes,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      callback(null, false);
      return;
    }

    callback(null, true);
  },
});
