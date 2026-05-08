import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { PassThrough } from 'stream';
import type { UploadApiResponse } from 'cloudinary';
import { StorageService } from '../storage.service';

@Injectable()
export class CloudinaryStorageService implements StorageService {
  constructor() {
    // Reads from process.env (ConfigModule is already global in your app).
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async upload(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<{ publicId: string }> {
    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            type: 'authenticated',
            resource_type: 'auto',
            filename_override: originalName,
            use_filename: true,
            unique_filename: true,
          },
          (error, uploadResult) => {
            if (error || !uploadResult) {
              reject(error ?? new Error('Cloudinary upload failed'));
              return;
            }
            resolve(uploadResult);
          },
        );

        const passthrough = new PassThrough();
        passthrough.end(fileBuffer);
        passthrough.pipe(uploadStream);
      });

      return { publicId: result.public_id };
    } catch (e) {
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  async getSignedUrl(publicId: string, expiresInSeconds = 300): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return cloudinary.url(publicId, {
      type: 'authenticated',
      sign_url: true,
      expires_at: expiresAt,
    });
  }

  async delete(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { type: 'authenticated' });
    } catch {
      throw new InternalServerErrorException('Failed to delete file');
    }
  }
}

