import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Voucher } from './voucher.entity';
import { BookingItem } from './booking-item.entity';

export enum BookingStatus {
  PENDING = 'PENDING',           // reserved, awaiting payment
  PAID = 'PAID',                 // payment confirmed
  CANCELLED = 'CANCELLED',       // cancelled by user or system
  FAILED = 'FAILED',             // payment failed
}

@Entity('bookings')
@Index(['idempotencyKey'], { unique: true, where: '"idempotencyKey" IS NOT NULL' })
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  customerName: string;

  @Column({ length: 255 })
  customerEmail: string;

  @Column({ type: 'varchar', length: 11, nullable: true })
  customerPhone: string | null;

  @Column({ type: 'varchar', length: 20, default: BookingStatus.PENDING })
  status: BookingStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalAmount: number; // original total before discount

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  finalAmount: number; // totalAmount - discountAmount

  @Column({ type: 'uuid', nullable: true })
  voucherId: string | null;

  @ManyToOne(() => Voucher, (voucher) => voucher.bookings, { nullable: true })
  @JoinColumn({ name: 'voucherId' })
  voucher: Voucher;

  @OneToMany(() => BookingItem, (item) => item.booking, { cascade: true })
  items: BookingItem[];

  // Idempotency key to prevent duplicate bookings from client retries
  @Column({ type: 'varchar', unique: true, nullable: true, length: 255 })
  idempotencyKey: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
