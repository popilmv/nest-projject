import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  IsUUID,
  Max,
} from 'class-validator';
import { FileVisibility } from '../types/file-visibility.enum';

export class PresignFileDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['product', 'user'])
  entityType: 'product' | 'user';

  @IsUUID()
  entityId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;

  // max 10MB for demo
  @IsInt()
  @IsPositive()
  @Max(10 * 1024 * 1024)
  size: number;

  @IsEnum(FileVisibility)
  visibility: FileVisibility;
}
