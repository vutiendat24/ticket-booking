import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Booking } from './booking.entity';
import { TicketCategory } from './ticket-category.entity';

@Entity('booking_items')
export class BookingItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bookingId: string;

  @ManyToOne(() => Booking, (booking) => booking.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bookingId' })
  booking: Booking;

  @Column()
  ticketCategoryId: string;

  @ManyToOne(() => TicketCategory, (category) => category.bookingItems, {
    eager: false,
  })
  @JoinColumn({ name: 'ticketCategoryId' })
  ticketCategory: TicketCategory;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number; // price snapshot at booking time

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: number; // quantity * unitPrice
}
