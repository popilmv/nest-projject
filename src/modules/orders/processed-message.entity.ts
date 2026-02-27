import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('processed_messages')
@Index(['messageId'], { unique: true })
export class ProcessedMessage {
  @PrimaryColumn({ type: 'uuid', name: 'message_id' })
  messageId: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId: string;

  @Column({ type: 'text', nullable: true })
  handler?: string | null;

  @CreateDateColumn({ name: 'processed_at' })
  processedAt: Date;
}
