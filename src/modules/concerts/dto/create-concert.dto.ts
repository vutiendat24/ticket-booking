import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConcertStatus } from '../../../entities/concert.entity';

export class CreateConcertDto {
  @ApiProperty({ example: 'Coldplay World Tour 2026' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Mỹ Đình National Stadium, Hanoi' })
  @IsString()
  @IsNotEmpty()
  venue: string;

  @ApiProperty({ example: '2026-08-15T19:00:00Z' })
  @IsDateString()
  eventDate: string;

  @ApiPropertyOptional({ example: 'Coldplay' })
  @IsString()
  @IsOptional()
  artist?: string;

  @ApiPropertyOptional({ example: 'Pop Rock' })
  @IsString()
  @IsOptional()
  genre?: string;

  @ApiPropertyOptional({ example: 'An epic night with Coldplay live in Vietnam' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/coldplay-poster.jpg' })
  @IsString()
  @IsOptional()
  posterUrl?: string;
}

export class UpdateConcertStatusDto {
  @ApiProperty({ enum: ConcertStatus, example: ConcertStatus.PUBLISHED })
  @IsEnum(ConcertStatus)
  status: ConcertStatus;
}
