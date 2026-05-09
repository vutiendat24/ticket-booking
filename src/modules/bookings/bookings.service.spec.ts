import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from '../../entities/booking.entity';
import { BookingItem } from '../../entities/booking-item.entity';
import { TicketCategory } from '../../entities/ticket-category.entity';
import { VouchersService } from '../vouchers/vouchers.service';
import { RedisLockService } from '../redis/redis-lock.service';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockReleaseFn = jest.fn().mockResolvedValue(undefined);
const mockRedisLockService = {
  acquireMultiple: jest.fn().mockResolvedValue(mockReleaseFn),
};

const mockVouchersService = {
  validateAndReserve: jest.fn(),
};

const mockBookingRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockTicketCategoryRepo = {
  decrement: jest.fn(),
};

const mockEntityManager = {
  getRepository: jest.fn(),
};

const mockDataSource = {
  transaction: jest.fn(),
};

// ─── Helper builders ─────────────────────────────────────────────────────────

function buildTicketCategory(overrides: Partial<TicketCategory> = {}): TicketCategory {
  return {
    id: 'cat-uuid-1',
    concertId: 'concert-uuid-1',
    name: 'Standard',
    price: 1500000,
    totalQuantity: 100,
    soldQuantity: 0,
    description: null,
    bookingItems: [],
    concert: undefined as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    availableQuantity: 100,
    ...overrides,
  } as unknown as TicketCategory;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('BookingsService', () => {
  let service: BookingsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getRepositoryToken(Booking), useValue: mockBookingRepo },
        { provide: getRepositoryToken(BookingItem), useValue: {} },
        { provide: getRepositoryToken(TicketCategory), useValue: mockTicketCategoryRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: VouchersService, useValue: mockVouchersService },
        { provide: RedisLockService, useValue: mockRedisLockService },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  // ─── Idempotency ────────────────────────────────────────────────────────────

  describe('createBooking — idempotency', () => {
    it('should return existing booking if idempotency key already exists', async () => {
      const existingBooking: Partial<Booking> = {
        id: 'existing-booking-uuid',
        idempotencyKey: 'my-unique-key',
        status: BookingStatus.PENDING,
      };

      mockBookingRepo.findOne.mockResolvedValueOnce(existingBooking);

      const result = await service.createBooking({
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        items: [{ ticketCategoryId: 'cat-uuid-1', quantity: 1 }],
        idempotencyKey: 'my-unique-key',
      });

      expect(result).toEqual(existingBooking);
      // Should NOT start a transaction for a duplicate key
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });

  // ─── Oversell prevention ───────────────────────────────────────────────────

  describe('createBooking — oversell prevention', () => {
    it('should throw BadRequestException when requested quantity exceeds available', async () => {
      mockBookingRepo.findOne.mockResolvedValueOnce(null); // no idempotency hit

      const soldOutCategory = buildTicketCategory({
        soldQuantity: 95, // only 5 left
        totalQuantity: 100,
      });

      // Set up transaction mock to execute the callback
      mockDataSource.transaction.mockImplementationOnce(async (cb: (em: EntityManager) => Promise<unknown>) => {
        const qb = {
          setLock: jest.fn().mockReturnThis(),
          whereInIds: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([soldOutCategory]),
        };
        mockEntityManager.getRepository.mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue(qb),
          create: jest.fn(),
          save: jest.fn(),
        });
        return cb(mockEntityManager as any);
      });

      await expect(
        service.createBooking({
          customerName: 'Test User',
          customerEmail: 'test@example.com',
          items: [{ ticketCategoryId: 'cat-uuid-1', quantity: 10 }], // requesting 10, only 5 available
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Status transitions ────────────────────────────────────────────────────

  describe('updateBookingStatus — state machine', () => {
    it('should allow PENDING → PAID transition', async () => {
      const booking: Partial<Booking> = {
        id: 'booking-1',
        status: BookingStatus.PENDING,
        items: [],
      };

      mockDataSource.transaction.mockImplementationOnce(async (cb: (em: EntityManager) => Promise<unknown>) => {
        const repoMock = {
          findOne: jest.fn().mockResolvedValue(booking),
          save: jest.fn().mockImplementation((b: Partial<Booking>) => Promise.resolve({ ...b })),
        };
        mockEntityManager.getRepository.mockReturnValue(repoMock);
        return cb(mockEntityManager as any);
      });

      const result = await service.updateBookingStatus('booking-1', {
        status: BookingStatus.PAID,
      });

      expect(result.status).toBe(BookingStatus.PAID);
    });

    it('should reject PAID → PENDING transition (invalid)', async () => {
      const booking: Partial<Booking> = {
        id: 'booking-1',
        status: BookingStatus.PAID,
        items: [],
      };

      mockDataSource.transaction.mockImplementationOnce(async (cb: (em: EntityManager) => Promise<unknown>) => {
        const repoMock = {
          findOne: jest.fn().mockResolvedValue(booking),
          save: jest.fn(),
        };
        mockEntityManager.getRepository.mockReturnValue(repoMock);
        return cb(mockEntityManager as any);
      });

      await expect(
        service.updateBookingStatus('booking-1', { status: BookingStatus.PENDING }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject CANCELLED → PAID transition (terminal state)', async () => {
      const booking: Partial<Booking> = {
        id: 'booking-1',
        status: BookingStatus.CANCELLED,
        items: [],
      };

      mockDataSource.transaction.mockImplementationOnce(async (cb: (em: EntityManager) => Promise<unknown>) => {
        const repoMock = {
          findOne: jest.fn().mockResolvedValue(booking),
          save: jest.fn(),
        };
        mockEntityManager.getRepository.mockReturnValue(repoMock);
        return cb(mockEntityManager as any);
      });

      await expect(
        service.updateBookingStatus('booking-1', { status: BookingStatus.PAID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for unknown booking id', async () => {
      mockDataSource.transaction.mockImplementationOnce(async (cb: (em: EntityManager) => Promise<unknown>) => {
        const repoMock = {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        };
        mockEntityManager.getRepository.mockReturnValue(repoMock);
        return cb(mockEntityManager as any);
      });

      await expect(
        service.updateBookingStatus('non-existent', { status: BookingStatus.PAID }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
