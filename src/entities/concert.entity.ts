import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { TicketCategory } from './ticket-category.entity';

@Entity('concerts')
export class Concert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 255 })
  venue: string;

  @Column({ type: 'timestamptz' })
  eventDate: Date;

  @Column({ type: 'varchar', length: 100, default: 'DRAFT' })
  status: ConcertStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  artist: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  genre: string;

  @Column({ type: 'varchar', nullable: true })
  posterUrl: string;

  @OneToMany(() => TicketCategory, (category) => category.concert, {
    cascade: true,
  })
  ticketCategories: TicketCategory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export enum ConcertStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}
