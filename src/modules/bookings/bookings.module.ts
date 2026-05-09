import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { Booking } from '../../entities/booking.entity';
import { BookingItem } from '../../entities/booking-item.entity';
import { TicketCategory } from '../../entities/ticket-category.entity';
import { VouchersModule } from '../vouchers/vouchers.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, BookingItem, TicketCategory]),
    VouchersModule,
    RedisModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
