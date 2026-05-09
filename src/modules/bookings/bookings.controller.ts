import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { BookingStatus } from '../../entities/booking.entity';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // ─────────────── Customer-Facing APIs ─────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Reserve tickets — idempotent, concurrent-safe',
    description: `
Creates a booking for one or more ticket categories.

**Idempotency**: Provide \`idempotencyKey\` to safely retry without creating duplicates.
The same booking is returned if the key was already used.

**Concurrency protection**:
1. Redis distributed lock (per ticket category) prevents most concurrent requests
2. PostgreSQL pessimistic lock (SELECT FOR UPDATE) is the hard safety net

**Voucher**: Optionally provide \`voucherCode\`. Validation and usage increment happen
atomically in the same DB transaction.
    `,
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    description: 'Optional header-based idempotency key (alternative to body field)',
    required: false,
  })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or insufficient tickets' })
  @ApiResponse({ status: 404, description: 'Ticket category not found' })
  @ApiResponse({ status: 503, description: 'System busy — Redis lock timeout, retry shortly' })
  createBooking(@Body() dto: CreateBookingDto) {
    return this.bookingsService.createBooking(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Track a booking by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking found' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  getBooking(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingsService.getBooking(id);
  }

  // ─────────────── Admin / Operation APIs ───────────────────────────────────

  @Get('admin/list')
  @ApiOperation({ summary: '[Admin] List all bookings with optional filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiQuery({
    name: 'email',
    required: false,
    type: String,
    description: 'Partial match on customer email',
  })
  @ApiResponse({ status: 200, description: 'Paginated booking list' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: BookingStatus,
    @Query('email') email?: string,
  ) {
    return this.bookingsService.findAll(page, limit, status, email);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: '[Admin] Manually update a booking status',
    description: `
Allowed transitions:
- **PENDING** → PAID, CANCELLED, FAILED
- **PAID** → CANCELLED (no inventory release)
- **FAILED** → CANCELLED
- **CANCELLED** → (terminal, no further transitions)

Cancelling a PENDING booking automatically releases inventory back to the ticket category.
    `,
  })
  @ApiParam({ name: 'id', type: String, description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking status updated' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updateBookingStatus(id, dto);
  }

  @Get('admin/stats')
  @ApiOperation({ summary: '[Admin] Booking stats grouped by status (dashboard)' })
  @ApiResponse({ status: 200, description: 'Stats array per booking status' })
  getDashboardStats() {
    return this.bookingsService.getDashboardStats();
  }
}
