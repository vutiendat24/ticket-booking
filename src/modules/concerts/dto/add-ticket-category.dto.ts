import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AddTicketCategoryDto {
  @ApiProperty({ example: 'VIP' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 2500000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalQuantity: number;

  @ApiPropertyOptional({ example: 'Front stage access, meet & greet included' })
  @IsString()
  @IsOptional()
  description?: string;
}
