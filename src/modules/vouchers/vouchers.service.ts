import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Voucher, VoucherDiscountType } from '../../entities/voucher.entity';
import { CreateVoucherDto } from './dto/create-voucher.dto';

export interface VoucherValidationResult {
  voucher: Voucher;
  discountAmount: number;
}

@Injectable()
export class VouchersService {
  private readonly logger = new Logger(VouchersService.name);

  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
  ) {}

  // ─── Admin APIs ───────────────────────────────────────────────────────────

  async create(dto: CreateVoucherDto): Promise<Voucher> {
    const existing = await this.voucherRepo.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Voucher code "${dto.code}" already exists`);

    const voucher = this.voucherRepo.create({
      ...dto,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      usedCount: 0,
    });
    return this.voucherRepo.save(voucher);
  }

  async findAll(page = 1, limit = 20) {
    const [data, total] = await this.voucherRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findByCode(code: string): Promise<Voucher> {
    const voucher = await this.voucherRepo.findOne({ where: { code } });
    if (!voucher) throw new NotFoundException(`Voucher "${code}" not found`);
    return voucher;
  }

  // ─── Internal validation (called inside booking transaction) ─────────────

  /**
   * Validates a voucher and atomically increments usedCount within
   * the SAME transaction to prevent double-use race conditions.
   *
   * Uses SELECT ... FOR UPDATE to prevent concurrent voucher application.
   */
  async validateAndReserve(
    code: string,
    orderAmount: number,
    em: EntityManager,
  ): Promise<VoucherValidationResult> {
    // Lock the voucher row within the transaction
    const voucher = await em
      .getRepository(Voucher)
      .createQueryBuilder('v')
      .setLock('pessimistic_write')
      .where('v.code = :code', { code })
      .getOne();

    if (!voucher) {
      throw new NotFoundException(`Voucher "${code}" not found`);
    }

    if (!voucher.isActive) {
      throw new BadRequestException(`Voucher "${code}" is not active`);
    }

    const now = new Date();
    if (voucher.validFrom && now < voucher.validFrom) {
      throw new BadRequestException(`Voucher "${code}" is not yet valid`);
    }
    if (voucher.validUntil && now > voucher.validUntil) {
      throw new BadRequestException(`Voucher "${code}" has expired`);
    }

    if (voucher.usedCount >= voucher.totalLimit) {
      throw new BadRequestException(`Voucher "${code}" has been fully redeemed`);
    }

    if (voucher.minOrderAmount && orderAmount < Number(voucher.minOrderAmount)) {
      throw new BadRequestException(
        `Minimum order amount for voucher "${code}" is ${voucher.minOrderAmount}. Your order is ${orderAmount}`,
      );
    }

    // Calculate discount
    let discountAmount = 0;
    if (voucher.discountType === VoucherDiscountType.PERCENTAGE) {
      discountAmount = (orderAmount * Number(voucher.discountValue)) / 100;
      if (voucher.maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, Number(voucher.maxDiscountAmount));
      }
    } else {
      discountAmount = Math.min(Number(voucher.discountValue), orderAmount);
    }

    // Increment usedCount atomically within the transaction
    voucher.usedCount += 1;
    await em.getRepository(Voucher).save(voucher);

    this.logger.log(`Voucher "${code}" applied. Discount: ${discountAmount}`);
    return { voucher, discountAmount };
  }
}
