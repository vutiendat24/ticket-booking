import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';

@ApiTags('Vouchers')
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  // ─────────────── Customer-Facing APIs ─────────────────────────────────────

  @Get('validate/:code')
  @ApiOperation({
    summary: 'Preview a voucher (does NOT apply or consume it)',
    description:
      'Returns voucher details and whether it is currently valid. ' +
      'The usage count is NOT incremented — only booking creation consumes a voucher.',
  })
  @ApiParam({ name: 'code', type: String, example: 'LAUNCH2026' })
  @ApiResponse({ status: 200, description: 'Voucher details' })
  @ApiResponse({ status: 404, description: 'Voucher not found' })
  previewVoucher(@Param('code') code: string) {
    return this.vouchersService.findByCode(code);
  }

  // ─────────────── Admin / Operation APIs ───────────────────────────────────

  @Post('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[Admin] Create a new voucher campaign' })
  @ApiResponse({ status: 201, description: 'Voucher created' })
  @ApiResponse({ status: 409, description: 'Voucher code already exists' })
  create(@Body() dto: CreateVoucherDto) {
    return this.vouchersService.create(dto);
  }

  @Get('admin/list')
  @ApiOperation({ summary: '[Admin] List all vouchers (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated voucher list' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.vouchersService.findAll(page, limit);
  }
}
