import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { Concert } from '../entities/concert.entity';
import { TicketCategory } from '../entities/ticket-category.entity';
import { Booking } from '../entities/booking.entity';
import { BookingItem } from '../entities/booking-item.entity';
import { Voucher } from '../entities/voucher.entity';

// Load .env when running CLI commands (migrations, seeding)
config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'ticket_platform',
  entities: [Concert, TicketCategory, Booking, BookingItem, Voucher],
  migrations: ['dist/database/migrations/*.js'],
  synchronize: false, // NEVER use synchronize in production
  logging: process.env.NODE_ENV !== 'production',
};

/**
 * DataSource instance used by TypeORM CLI for migrations.
 * Usage: npx typeorm migration:run -d src/database/data-source.ts
 */
const AppDataSource = new DataSource(dataSourceOptions);

export default AppDataSource;
