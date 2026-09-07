import { cloudinary } from '../../config/cloudinary.js';
import { AppError } from '../errors/AppError.js';

export class CloudinaryService {
  static async uploadImage(
    fileBuffer: Buffer,
    folder = 'emergency_ambulance'
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }],
        },
        (error, result) => {
          if (error || !result) {
            return reject(
              new AppError(`Image upload failed: ${error?.message || 'Unknown error'}`, 500)
            );
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        }
      );
      uploadStream.end(fileBuffer);
    });
  }

  static async deleteImage(publicId: string): Promise<boolean> {
    try {
      const res = await cloudinary.uploader.destroy(publicId);
      return res.result === 'ok';
    } catch {
      return false;
    }
  }
}
