import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsUUID,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class BookingItemDto {
  @ApiProperty({
    example: 'uuid-of-ticket-category',
    description: 'UUID of the ticket category to reserve',
  })
  @IsUUID('4')
  ticketCategoryId: string;

  @ApiProperty({ example: 2, description: 'Number of tickets (1–10 per category)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateBookingDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  customerName: string;

  @ApiProperty({ example: 'nguyenvana@email.com' })
  @IsEmail()
  @MaxLength(255)
  customerEmail: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Contact phone number' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  customerPhone?: string;

  @ApiProperty({ type: [BookingItemDto], description: 'List of ticket categories and quantities (1–5 items)' })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one ticket item is required' })
  @ArrayMaxSize(5, { message: 'Maximum 5 different ticket categories per booking' })
  @ValidateNested({ each: true })
  @Type(() => BookingItemDto)
  items: BookingItemDto[];

  @ApiPropertyOptional({
    example: 'LAUNCH2026',
    description: 'Promotional voucher code (optional)',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  voucherCode?: string;

  @ApiPropertyOptional({
    example: 'booking-uuid-v4-idempotency-key',
    description:
      'Client-generated idempotency key. Include this to safely retry the request ' +
      'without creating duplicate bookings. Recommended to use UUIDv4.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  idempotencyKey?: string;

  @ApiPropertyOptional({
    example: 'Anniversary gift for my partner',
    description: 'Optional note for the booking',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
