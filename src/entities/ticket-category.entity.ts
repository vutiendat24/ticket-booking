import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Concert } from './concert.entity';
import { BookingItem } from './booking-item.entity';

@Entity('ticket_categories')
export class TicketCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  concertId: string;

  @ManyToOne(() => Concert, (concert) => concert.ticketCategories, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'concertId' })
  concert: Concert;

  @Column({ length: 100 })
  name: string; // e.g. "VIP", "Standard", "Early Bird"

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  @Column({ type: 'int' })
  totalQuantity: number;

  @Column({ type: 'int', default: 0 })
  soldQuantity: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @OneToMany(() => BookingItem, (item) => item.ticketCategory)
  bookingItems: BookingItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Virtual field – not stored in DB
  get availableQuantity(): number {
    return this.totalQuantity - this.soldQuantity;
  }
}
