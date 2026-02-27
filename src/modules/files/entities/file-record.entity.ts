import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FileStatus } from '../types/file-status.enum';
import { FileVisibility } from '../types/file-visibility.enum';

@Entity('file_records')
export class FileRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  ownerId: string;

  @Index()
  @Column({ type: 'text' })
  entityType: string; // 'user' | 'product' | ...

  @Index()
  @Column({ type: 'uuid' })
  entityId: string;

  @Index({ unique: true })
  @Column({ type: 'text' })
  key: string;

  @Column({ type: 'text' })
  bucket: string;

  @Column({ type: 'text' })
  contentType: string;

  @Column({ type: 'int' })
  size: number;

  @Column({ type: 'text', nullable: true })
  checksum?: string | null;

  @Column({
    type: 'text',
    default: FileVisibility.Private,
  })
  visibility: FileVisibility;

  @Column({
    type: 'text',
    default: FileStatus.Pending,
  })
  status: FileStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
