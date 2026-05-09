import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Concert, ConcertStatus } from '../entities/concert.entity';
import { TicketCategory } from '../entities/ticket-category.entity';
import { Voucher, VoucherDiscountType } from '../entities/voucher.entity';

/**
 * SeederService — seeds initial data on first boot (dev/staging only).
 *
 * Behaviour:
 * - Runs automatically when the app starts via OnApplicationBootstrap.
 * - Each seed method is idempotent: it checks if records already exist before inserting.
 * - In production, disable seeding by setting SEED_ON_BOOT=false in .env.
 *
 * Manual seeding:
 *   npm run seed
 */
@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    @InjectRepository(Concert)
    private readonly concertRepo: Repository<Concert>,
    @InjectRepository(TicketCategory)
    private readonly ticketCategoryRepo: Repository<TicketCategory>,
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.SEED_ON_BOOT === 'false') {
      this.logger.log('Seeding skipped (SEED_ON_BOOT=false)');
      return;
    }
    await this.run();
  }

  /** Run all seed methods in order */
  async run() {
    this.logger.log('Starting database seeding...');
    await this.seedConcerts();
    await this.seedVouchers();
    this.logger.log('Database seeding complete.');
  }

  // ─── Concert seed ─────────────────────────────────────────────────────────

  private async seedConcerts() {
    const count = await this.concertRepo.count();
    if (count > 0) {
      this.logger.log(`Concerts already seeded (${count} records). Skipping.`);
      return;
    }

    this.logger.log('Seeding concerts...');

    // ── Concert 1: Published flash sale ──────────────────────────────────────
    const coldplayConcert = await this.concertRepo.save(
      this.concertRepo.create({
        name: 'Coldplay Music Of The Spheres World Tour – Hanoi',
        venue: 'Mỹ Đình National Stadium, Hanoi',
        eventDate: new Date('2026-08-15T19:00:00+07:00'),
        artist: 'Coldplay',
        genre: 'Pop Rock',
        status: ConcertStatus.PUBLISHED,
        description:
          'Experience the magic of Coldplay live in Vietnam for the very first time. A night of color, music, and emotion.',
      }),
    );

    await this.ticketCategoryRepo.save([
      this.ticketCategoryRepo.create({
        concertId: coldplayConcert.id,
        name: 'VIP Diamond',
        price: 5_000_000,
        totalQuantity: 200,
        soldQuantity: 0,
        description: 'Front stage access, meet & greet, exclusive merch bundle',
      }),
      this.ticketCategoryRepo.create({
        concertId: coldplayConcert.id,
        name: 'VIP Gold',
        price: 3_000_000,
        totalQuantity: 800,
        soldQuantity: 0,
        description: 'Priority entry, premium standing area',
      }),
      this.ticketCategoryRepo.create({
        concertId: coldplayConcert.id,
        name: 'Standard',
        price: 1_500_000,
        totalQuantity: 15_000,
        soldQuantity: 0,
        description: 'General admission',
      }),
      this.ticketCategoryRepo.create({
        concertId: coldplayConcert.id,
        name: 'Early Bird Standard',
        price: 1_000_000,
        totalQuantity: 5_000,
        soldQuantity: 0,
        description: 'Limited early bird pricing — first come, first served!',
      }),
    ]);

    // ── Concert 2: Draft (not yet published) ─────────────────────────────────
    const sontungConcert = await this.concertRepo.save(
      this.concertRepo.create({
        name: 'Sơn Tùng M-TP Summer Concert 2026',
        venue: 'Phú Thọ Stadium, Ho Chi Minh City',
        eventDate: new Date('2026-09-20T20:00:00+07:00'),
        artist: 'Sơn Tùng M-TP',
        genre: 'V-Pop',
        status: ConcertStatus.DRAFT,
        description: 'The biggest domestic pop star returns to the stage.',
      }),
    );

    await this.ticketCategoryRepo.save([
      this.ticketCategoryRepo.create({
        concertId: sontungConcert.id,
        name: 'VIP',
        price: 2_500_000,
        totalQuantity: 500,
        soldQuantity: 0,
        description: 'VIP standing area + exclusive laminate',
      }),
      this.ticketCategoryRepo.create({
        concertId: sontungConcert.id,
        name: 'Standard',
        price: 1_200_000,
        totalQuantity: 10_000,
        soldQuantity: 0,
        description: 'General admission',
      }),
    ]);

    this.logger.log('Concerts seeded.');
  }

  // ─── Voucher seed ─────────────────────────────────────────────────────────

  private async seedVouchers() {
    const count = await this.voucherRepo.count();
    if (count > 0) {
      this.logger.log(`Vouchers already seeded (${count} records). Skipping.`);
      return;
    }

    this.logger.log('Seeding vouchers...');

    await this.voucherRepo.save([
      // ── 10% off, max 200k, min order 1M, valid all year ──────────────────
      this.voucherRepo.create({
        code: 'LAUNCH2026',
        discountType: VoucherDiscountType.PERCENTAGE,
        discountValue: 10,
        maxDiscountAmount: 200_000,
        minOrderAmount: 1_000_000,
        totalLimit: 1_000,
        usedCount: 0,
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validUntil: new Date('2026-12-31T23:59:59Z'),
        isActive: true,
      }),
      // ── Flat 500k off, min order 2M, valid during flash sale period ───────
      this.voucherRepo.create({
        code: 'FLASHSALE500',
        discountType: VoucherDiscountType.FIXED_AMOUNT,
        discountValue: 500_000,
        minOrderAmount: 2_000_000,
        totalLimit: 200,
        usedCount: 0,
        validFrom: new Date('2026-08-01T00:00:00Z'),
        validUntil: new Date('2026-08-15T23:59:59Z'),
        isActive: true,
      }),
      // ── 15% off for high-value VIP orders ─────────────────────────────────
      this.voucherRepo.create({
        code: 'VIP15',
        discountType: VoucherDiscountType.PERCENTAGE,
        discountValue: 15,
        maxDiscountAmount: 750_000,
        minOrderAmount: 5_000_000,
        totalLimit: 50,
        usedCount: 0,
        isActive: true,
      }),
    ]);

    this.logger.log('Vouchers seeded.');
  }
}
