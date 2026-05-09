import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsInt,
  IsOptional,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { VoucherDiscountType } from '../../../entities/voucher.entity';

export class CreateVoucherDto {
  @ApiProperty({ example: 'LAUNCH2026', description: 'Unique voucher code' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ enum: VoucherDiscountType, example: VoucherDiscountType.PERCENTAGE })
  @IsEnum(VoucherDiscountType)
  discountType: VoucherDiscountType;

  @ApiProperty({ example: 10, description: '10 = 10% off or 50000 = 50,000 VND off' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue: number;

  @ApiPropertyOptional({ example: 200000, description: 'Max discount cap (for PERCENTAGE type)' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ example: 500000, description: 'Minimum order amount required to use voucher' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  minOrderAmount?: number;

  @ApiProperty({ example: 1000, description: 'Total number of times this voucher can be redeemed' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalLimit: number;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31T23:59:59Z' })
  @IsDateString()
  @IsOptional()
  validUntil?: string;
}
