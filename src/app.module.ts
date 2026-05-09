import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConcertsModule } from './modules/concerts/concerts.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { RedisModule } from './modules/redis/redis.module';
import { Concert } from './entities/concert.entity';
import { TicketCategory } from './entities/ticket-category.entity';
import { Booking } from './entities/booking.entity';
import { BookingItem } from './entities/booking-item.entity';
import { Voucher } from './entities/voucher.entity';
import { SeederService } from './database/seeder.service';
import { validateEnv } from './config/app.config';

@Module({
  imports: [
    // ── Configuration ─────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,     // Throws on startup if env vars are missing/invalid
    }),

    // ── Database ───────────────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_NAME', 'ticket_platform'),
        entities: [Concert, TicketCategory, Booking, BookingItem, Voucher],
        // synchronize: true is fine for development; use migrations in production.
        // To switch: set synchronize: false and run `typeorm migration:run`
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') === 'development',
        // Connection pool tuning for flash sale load
        extra: {
          max: 20,     // Max pool connections
          min: 5,      // Min idle connections
          idleTimeoutMillis: 30_000,
        },
      }),
    }),

    // ── Repos needed by SeederService (outside feature modules) ───────────────
    TypeOrmModule.forFeature([Concert, TicketCategory, Voucher]),

    // ── Global Modules ─────────────────────────────────────────────────────────
    RedisModule,    // @Global — available everywhere without re-importing

    // ── Feature Modules ────────────────────────────────────────────────────────
    ConcertsModule,
    BookingsModule,
    VouchersModule,
  ],
  providers: [SeederService],
})
export class AppModule {}
