import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Booking } from './booking.entity';

@Entity('vouchers')
export class Voucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 20 })
  discountType: VoucherDiscountType; // PERCENTAGE | FIXED_AMOUNT

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  discountValue: number; // e.g. 10 for 10%, or 50000 for 50k fixed

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  maxDiscountAmount: number; // cap for percentage discounts

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  minOrderAmount: number; // minimum booking amount required

  @Column({ type: 'int' })
  totalLimit: number; // total number of times this voucher can be used

  @Column({ type: 'int', default: 0 })
  usedCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  validFrom: Date;

  @Column({ type: 'timestamptz', nullable: true })
  validUntil: Date;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Booking, (booking) => booking.voucher)
  bookings: Booking[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export enum VoucherDiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
}
