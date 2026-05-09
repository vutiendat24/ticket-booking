import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { Voucher, VoucherDiscountType } from '../../entities/voucher.entity';

const mockVoucherRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  findAndCount: jest.fn(),
};

function buildVoucher(overrides = {}): Voucher {
  return {
    id: 'voucher-uuid-1',
    code: 'TEST10',
    discountType: VoucherDiscountType.PERCENTAGE,
    discountValue: 10,
    maxDiscountAmount: 200000,
    minOrderAmount: 500000,
    totalLimit: 100,
    usedCount: 0,
    validFrom: new Date('2026-01-01'),
    validUntil: new Date('2026-12-31'),
    isActive: true,
    bookings: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Voucher;
}

describe('VouchersService', () => {
  let service: VouchersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VouchersService,
        { provide: getRepositoryToken(Voucher), useValue: mockVoucherRepo },
      ],
    }).compile();
    service = module.get<VouchersService>(VouchersService);
  });

  describe('validateAndReserve', () => {
    const mockEm = {
      getRepository: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should calculate PERCENTAGE discount correctly', async () => {
      const voucher = buildVoucher();
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(voucher),
      };
      mockEm.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        save: jest.fn().mockResolvedValue({ ...voucher, usedCount: 1 }),
      });

      const result = await service.validateAndReserve('TEST10', 1000000, mockEm as any);

      expect(result.discountAmount).toBe(100000); // 10% of 1,000,000
    });

    it('should cap PERCENTAGE discount at maxDiscountAmount', async () => {
      const voucher = buildVoucher({ discountValue: 30, maxDiscountAmount: 200000 });
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(voucher),
      };
      mockEm.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        save: jest.fn().mockResolvedValue(voucher),
      });

      // 30% of 1,500,000 = 450,000 → but cap is 200,000
      const result = await service.validateAndReserve('TEST10', 1500000, mockEm as any);
      expect(result.discountAmount).toBe(200000);
    });

    it('should throw if voucher is fully redeemed', async () => {
      const voucher = buildVoucher({ usedCount: 100, totalLimit: 100 });
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(voucher),
      };
      mockEm.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        save: jest.fn(),
      });

      await expect(service.validateAndReserve('TEST10', 1000000, mockEm as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if order amount is below minimum', async () => {
      const voucher = buildVoucher({ minOrderAmount: 500000 });
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(voucher),
      };
      mockEm.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        save: jest.fn(),
      });

      await expect(
        service.validateAndReserve('TEST10', 200000, mockEm as any), // below 500,000 minimum
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if voucher has expired', async () => {
      const voucher = buildVoucher({ validUntil: new Date('2020-01-01') }); // expired
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(voucher),
      };
      mockEm.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        save: jest.fn(),
      });

      await expect(service.validateAndReserve('TEST10', 1000000, mockEm as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for unknown voucher code', async () => {
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockEm.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        save: jest.fn(),
      });

      await expect(service.validateAndReserve('INVALID', 1000000, mockEm as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
