import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloudinary } from '../../config/cloudinary.js';
import { env } from '../../config/env.js';

export class CloudinaryService {
  private static isConfigured(): boolean {
    return Boolean(
      env.CLOUDINARY_CLOUD_NAME &&
        env.CLOUDINARY_API_KEY &&
        env.CLOUDINARY_API_SECRET &&
        !env.CLOUDINARY_API_KEY.includes('your_cloudinary')
    );
  }

  private static saveLocally(
    folder: string,
    fileBuffer: Buffer
  ): { url: string; publicId: string } {
    const uploadsDir = join(process.cwd(), 'uploads', folder);
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }
    const filename = `${randomUUID()}.jpg`;
    const filePath = join(uploadsDir, filename);
    writeFileSync(filePath, fileBuffer);

    return {
      url: `http://localhost:${env.PORT}/uploads/${folder}/${filename}`,
      publicId: `local_${folder}_${filename}`,
    };
  }

  static async uploadImage(
    fileBuffer: Buffer,
    folder = 'emergency_ambulance'
  ): Promise<{ url: string; publicId: string }> {
    if (!CloudinaryService.isConfigured()) {
      return CloudinaryService.saveLocally(folder, fileBuffer);
    }

    try {
      return await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: 'image',
            transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }],
          },
          (error, result) => {
            if (error || !result) {
              return reject(error || new Error('Upload result empty'));
            }
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
            });
          }
        );
        uploadStream.end(fileBuffer);
      });
    } catch (err: any) {
      console.warn(
        `⚠️ Cloudinary upload error (${err?.message || 'Unknown error'}). Falling back to local file storage.`
      );
      return CloudinaryService.saveLocally(folder, fileBuffer);
    }
  }

  static async deleteImage(publicId: string): Promise<boolean> {
    try {
      if (publicId.startsWith('local_')) {
        const parts = publicId.replace('local_', '').split('_');
        const filename = parts.pop();
        const folder = parts.join('_');
        if (folder && filename) {
          const filePath = join(process.cwd(), 'uploads', folder, filename);
          if (existsSync(filePath)) {
            unlinkSync(filePath);
          }
        }
        return true;
      }
      const res = await cloudinary.uploader.destroy(publicId);
      return res.result === 'ok';
    } catch {
      return false;
    }
  }
}
