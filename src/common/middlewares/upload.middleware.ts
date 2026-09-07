import multer from 'multer';
import { BadRequestError } from '../errors/AppError.js';

// Memory storage to stream directly to Cloudinary
const storage = multer.memoryStorage();

export const uploadSingleImage = (fieldName = 'image', maxSizeBytes = 5 * 1024 * 1024) => {
  return multer({
    storage,
    limits: {
      fileSize: maxSizeBytes,
    },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new BadRequestError('Only image files (JPEG, PNG, WEBP) are allowed') as any, false);
      }
    },
  }).single(fieldName);
};
