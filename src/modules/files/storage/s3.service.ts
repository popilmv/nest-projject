import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('AWS_REGION');
    this.client = new S3Client({ region });
  }

  async createPresignedPutUrl(params: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSec: number;
  }): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      ContentType: params.contentType,
    });

    return getSignedUrl(this.client, cmd, { expiresIn: params.expiresInSec });
  }

  async createPresignedGetUrl(params: {
    bucket: string;
    key: string;
    expiresInSec: number;
  }): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
    });

    return getSignedUrl(this.client, cmd, { expiresIn: params.expiresInSec });
  }
}
