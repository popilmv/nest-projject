import { IsUUID } from 'class-validator';

export class CompleteFileDto {
  @IsUUID()
  fileId: string;
}
