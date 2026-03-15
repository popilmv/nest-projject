import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Product } from '../products/product.entity';
import { PresignFileDto } from './dto/presign-file.dto';
import { CompleteFileDto } from './dto/complete-file.dto';
import { FileRecord } from './entities/file-record.entity';
import { S3Service } from './storage/s3.service';
import { FileStatus } from './types/file-status.enum';
import { FileVisibility } from './types/file-visibility.enum';
import { RequestUser } from '../../common/auth/user.types';

@Injectable()
export class FilesService {
  constructor(
    private readonly config: ConfigService,
    private readonly s3: S3Service,
    @InjectRepository(FileRecord)
    private readonly filesRepo: Repository<FileRecord>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  private get bucket(): string {
    const bucket = this.config.get<string>('S3_BUCKET');
    if (!bucket) throw new Error('Missing S3_BUCKET in env');
    return bucket;
  }

  private get presignExpiresSec(): number {
    return Number(this.config.get<string>('FILES_PRESIGN_EXPIRES_SEC') || 120);
  }

  private get cloudfrontBaseUrl(): string | undefined {
    const v = this.config.get<string>('CLOUDFRONT_BASE_URL');
    return v || undefined;
  }

  private buildKey(dto: PresignFileDto): string {
    const ext =
      dto.contentType === 'image/jpeg'
        ? 'jpg'
        : dto.contentType === 'image/png'
          ? 'png'
          : 'webp';

    const fileUuid = uuidv4();

    if (dto.entityType === 'product') {
      return `products/${dto.entityId}/images/${fileUuid}.${ext}`;
    }

    // user
    return `users/${dto.entityId}/avatars/${fileUuid}.${ext}`;
  }

  private assertCanPresign(user: RequestUser, dto: PresignFileDto) {
    // For demo: product images require admin
    if (dto.entityType === 'product' && user.role !== 'admin') {
      throw new ForbiddenException('Only admin can upload product images');
    }

    // For user avatar: only owner can presign for self
    if (dto.entityType === 'user' && user.id !== dto.entityId) {
      throw new ForbiddenException('Cannot upload avatar for another user');
    }
  }

  async presign(user: RequestUser, dto: PresignFileDto) {
    this.assertCanPresign(user, dto);

    const key = this.buildKey(dto);

    const file = this.filesRepo.create({
      ownerId: user.id,
      entityType: dto.entityType,
      entityId: dto.entityId,
      key,
      bucket: this.bucket,
      contentType: dto.contentType,
      size: dto.size,
      visibility: dto.visibility ?? FileVisibility.Private,
      status: FileStatus.Pending,
    });

    await this.filesRepo.save(file);

    const uploadUrl = await this.s3.createPresignedPutUrl({
      bucket: file.bucket,
      key: file.key,
      contentType: file.contentType,
      expiresInSec: this.presignExpiresSec,
    });

    return {
      fileId: file.id,
      key: file.key,
      uploadUrl,
      contentType: file.contentType,
    };
  }

  async complete(user: RequestUser, dto: CompleteFileDto) {
    const file = await this.filesRepo.findOne({ where: { id: dto.fileId } });
    if (!file) throw new NotFoundException('File not found');

    // Ownership check (required by HW)
    if (file.ownerId !== user.id) {
      throw new ForbiddenException('Cannot complete чужий файл');
    }

    if (file.status !== FileStatus.Pending) {
      throw new ConflictException('File is not pending');
    }

    file.status = FileStatus.Ready;
    await this.filesRepo.save(file);

    // Domain integration (Product image)
    if (file.entityType === 'product') {
      await this.productsRepo.update(
        { id: file.entityId },
        { imageFileId: file.id },
      );
    }

    return { ok: true };
  }

  async getFileUrl(user: RequestUser, fileId: string) {
    const file = await this.filesRepo.findOne({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');

    if (file.status !== FileStatus.Ready) {
      throw new BadRequestException('File is not ready');
    }

    // Authorization on backend
    if (
      file.visibility === FileVisibility.Private &&
      file.ownerId !== user.id
    ) {
      throw new ForbiddenException('No access to this file');
    }

    // Public delivery: CloudFront (preferred) or S3 URL
    if (file.visibility === FileVisibility.Public) {
      if (this.cloudfrontBaseUrl) {
        return {
          url: `${this.cloudfrontBaseUrl.replace(/\/$/, '')}/${file.key}`,
        };
      }
      return {
        url: `https://${file.bucket}.s3.${this.config.get<string>('AWS_REGION')}.amazonaws.com/${file.key}`,
      };
    }

    // Private: short-lived presigned GET
    const url = await this.s3.createPresignedGetUrl({
      bucket: file.bucket,
      key: file.key,
      expiresInSec: this.presignExpiresSec,
    });

    return { url };
  }
}
