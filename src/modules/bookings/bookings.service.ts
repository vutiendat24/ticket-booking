import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Booking, BookingStatus } from '../../entities/booking.entity';
import { BookingItem } from '../../entities/booking-item.entity';
import { TicketCategory } from '../../entities/ticket-category.entity';
import { Voucher } from '../../entities/voucher.entity';

import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { VouchersService } from '../vouchers/vouchers.service';
import { RedisLockService } from '../redis/redis-lock.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BookingItemPayload {
  ticketCategoryId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

// ─── State Machine ────────────────────────────────────────────────────────────

/**
 * Valid status transitions for a booking.
 *
 * PENDING  → PAID | CANCELLED | FAILED
 * PAID     → CANCELLED        (admin override — no inventory release, ticket already confirmed)
 * FAILED   → CANCELLED
 * CANCELLED → (terminal)
 */
const BOOKING_TRANSITIONS: Readonly<Record<BookingStatus, BookingStatus[]>> = {
  [BookingStatus.PENDING]: [
    BookingStatus.PAID,
    BookingStatus.CANCELLED,
    BookingStatus.FAILED,
  ],
  [BookingStatus.PAID]: [BookingStatus.CANCELLED],
  [BookingStatus.FAILED]: [BookingStatus.CANCELLED],
  [BookingStatus.CANCELLED]: [],
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(TicketCategory)
    private readonly ticketCategoryRepo: Repository<TicketCategory>,
    private readonly dataSource: DataSource,
    private readonly vouchersService: VouchersService,
    private readonly redisLockService: RedisLockService,
  ) {}

  // ─── Customer API ──────────────────────────────────────────────────────────

  /**
   * Reserve tickets in a concurrent-safe, idempotent manner.
   *
   * Flow:
   *   1. Idempotency check (fast path, no DB transaction)
   *   2. Acquire Redis distributed locks per ticket category (sorted to avoid deadlocks)
   *   3. Open DB transaction
   *   4. SELECT ... FOR UPDATE on ticket categories (pessimistic write lock)
   *   5. Validate inventory availability
   *   6. Validate & apply voucher (within same transaction)
   *   7. Persist Booking + BookingItems + update soldQuantity atomically
   *   8. Release Redis locks in finally block
   */
  async createBooking(dto: CreateBookingDto): Promise<Booking> {
    // ── Step 1: Idempotency check ─────────────────────────────────────────────
    if (dto.idempotencyKey) {
      const existing = await this.bookingRepo.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
        relations: ['items', 'items.ticketCategory', 'voucher'],
      });
      if (existing) {
        this.logger.log(
          `[Idempotency] Returning existing booking ${existing.id} for key: ${dto.idempotencyKey}`,
        );
        return existing;
      }
    }

    // ── Step 2: Acquire Redis locks (sorted IDs prevent deadlocks) ─────────────
    const sortedCategoryIds = [...new Set(dto.items.map((i) => i.ticketCategoryId))].sort();
    const lockKeys = sortedCategoryIds.map((id) => `lock:ticket_category:${id}`);

    const releaseLocks = await this.redisLockService.acquireMultiple(lockKeys, 10_000);

    try {
      return await this.dataSource.transaction(async (em: EntityManager) => {
        // ── Step 3 & 4: Pessimistic write lock on ticket categories ────────────
        const categories = await em
          .getRepository(TicketCategory)
          .createQueryBuilder('tc')
          .setLock('pessimistic_write')
          .whereInIds(sortedCategoryIds)
          .getMany();

        if (categories.length !== sortedCategoryIds.length) {
          const foundIds = new Set(categories.map((c) => c.id));
          const missing = sortedCategoryIds.filter((id) => !foundIds.has(id));
          throw new NotFoundException(
            `Ticket categories not found: ${missing.join(', ')}`,
          );
        }

        const categoryMap = new Map(categories.map((c) => [c.id, c]));

        // ── Step 5: Validate inventory ──────────────────────────────────────────
        let totalAmount = 0;
        const itemPayloads: BookingItemPayload[] = [];

        for (const item of dto.items) {
          const category = categoryMap.get(item.ticketCategoryId)!;
          const available = category.totalQuantity - category.soldQuantity;

          if (item.quantity > available) {
            throw new BadRequestException(
              `Not enough tickets for "${category.name}". ` +
              `Available: ${available}, Requested: ${item.quantity}`,
            );
          }

          const unitPrice = Number(category.price);
          const subtotal = unitPrice * item.quantity;
          totalAmount += subtotal;

          itemPayloads.push({
            ticketCategoryId: category.id,
            quantity: item.quantity,
            unitPrice,
            subtotal,
          });

          // Update in-memory — will be flushed with em.save below
          category.soldQuantity += item.quantity;
        }

        // ── Step 6: Validate & apply voucher (within transaction) ───────────────
        let discountAmount = 0;
        let voucher: Voucher | null = null;

        if (dto.voucherCode) {
          const voucherResult = await this.vouchersService.validateAndReserve(
            dto.voucherCode,
            totalAmount,
            em,
          );
          voucher = voucherResult.voucher;
          discountAmount = voucherResult.discountAmount;
        }

        const finalAmount = Math.max(0, totalAmount - discountAmount);

        // ── Step 7: Persist Booking ─────────────────────────────────────────────
        const booking = em.getRepository(Booking).create({
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone ?? null,
          status: BookingStatus.PENDING,
          totalAmount,
          discountAmount,
          finalAmount,
          voucherId: voucher?.id ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
          notes: dto.notes ?? null,
        });
        const savedBooking = await em.getRepository(Booking).save(booking);

        // ── Step 7b: Persist BookingItems (batch insert) ────────────────────────
        const bookingItems = itemPayloads.map((payload) => {
          const item = new BookingItem();
          item.bookingId = savedBooking.id;
          item.ticketCategoryId = payload.ticketCategoryId;
          item.quantity = payload.quantity;
          item.unitPrice = payload.unitPrice;
          item.subtotal = payload.subtotal;
          return item;
        });
        await em.getRepository(BookingItem).save(bookingItems); // single batch INSERT

        // ── Step 7c: Flush soldQuantity changes for all categories ──────────────
        await em.getRepository(TicketCategory).save(categories);

        this.logger.log(
          `[BookingsService] Created booking ${savedBooking.id} ` +
          `(total: ${totalAmount}, discount: ${discountAmount}, final: ${finalAmount})`,
        );
        return savedBooking;
      });
    } finally {
      // Always release locks, even if the transaction throws
      await releaseLocks();
    }
  }

  /** Get a single booking by ID (customer tracking) */
  async getBooking(id: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['items', 'items.ticketCategory', 'voucher'],
    });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return booking;
  }

  // ─── Admin / Operation APIs ────────────────────────────────────────────────

  /** Paginated list of all bookings with optional filters */
  async findAll(
    page: number,
    limit: number,
    status?: BookingStatus,
    email?: string,
  ) {
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.items', 'items')
      .leftJoinAndSelect('items.ticketCategory', 'tc')
      .leftJoinAndSelect('b.voucher', 'voucher')
      .orderBy('b.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere('b.status = :status', { status });
    if (email) qb.andWhere('b.customerEmail ILIKE :email', { email: `%${email}%` });

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Manually update a booking's status (admin operation).
   *
   * Behaviour on cancellation:
   * - PENDING → CANCELLED: releases sold inventory back to the category
   * - PAID → CANCELLED: does NOT release inventory
   *   (ticket was confirmed and issued; inventory release is a separate ops decision)
   */
  async updateBookingStatus(id: string, dto: UpdateBookingStatusDto): Promise<Booking> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const booking = await em.getRepository(Booking).findOne({
        where: { id },
        relations: ['items', 'items.ticketCategory'],
      });
      if (!booking) throw new NotFoundException(`Booking ${id} not found`);

      this.assertValidTransition(booking.status, dto.status);

      // Only release inventory when cancelling a PENDING booking
      if (
        dto.status === BookingStatus.CANCELLED &&
        booking.status === BookingStatus.PENDING
      ) {
        await this.releaseInventory(booking.items, em);
      }

      booking.status = dto.status;
      if (dto.reason) booking.failureReason = dto.reason;

      const updated = await em.getRepository(Booking).save(booking);
      this.logger.log(
        `[BookingsService] Booking ${id} status: ${booking.status} → ${dto.status}`,
      );
      return updated;
    });
  }

  /** Dashboard summary: booking counts and revenue grouped by status */
  async getDashboardStats() {
    const rows = await this.bookingRepo
      .createQueryBuilder('b')
      .select('b.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(b.finalAmount), 0)', 'totalRevenue')
      .groupBy('b.status')
      .getRawMany<{ status: BookingStatus; count: string; totalRevenue: string }>();

    return rows.map((r) => ({
      status: r.status,
      count: parseInt(r.count, 10),
      totalRevenue: parseFloat(r.totalRevenue),
    }));
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private assertValidTransition(current: BookingStatus, next: BookingStatus): void {
    const allowed = BOOKING_TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot transition booking from "${current}" to "${next}". ` +
        `Allowed next states: [${allowed.join(', ') || 'none'}]`,
      );
    }
  }

  private async releaseInventory(
    items: BookingItem[],
    em: EntityManager,
  ): Promise<void> {
    await Promise.all(
      items.map((item) =>
        em
          .getRepository(TicketCategory)
          .decrement({ id: item.ticketCategoryId }, 'soldQuantity', item.quantity),
      ),
    );
  }
}
