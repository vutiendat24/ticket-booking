import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
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
} from '@nestjs/swagger';
import { ConcertsService } from './concerts.service';
import { CreateConcertDto, UpdateConcertStatusDto } from './dto/create-concert.dto';
import { AddTicketCategoryDto } from './dto/add-ticket-category.dto';

@ApiTags('Concerts')
@Controller('concerts')
export class ConcertsController {
  constructor(private readonly concertsService: ConcertsService) {}

  // ─────────────── Customer-Facing APIs ─────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Browse published concerts (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated list of published concerts' })
  findPublished(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.concertsService.findPublished(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get concert details with ticket categories' })
  @ApiParam({ name: 'id', type: String, description: 'Concert UUID' })
  @ApiResponse({ status: 200, description: 'Concert found' })
  @ApiResponse({ status: 404, description: 'Concert not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.concertsService.findOne(id);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Check real-time ticket availability for a concert' })
  @ApiParam({ name: 'id', type: String, description: 'Concert UUID' })
  @ApiResponse({ status: 200, description: 'Availability info per ticket category' })
  @ApiResponse({ status: 404, description: 'Concert not found' })
  getAvailability(@Param('id', ParseUUIDPipe) id: string) {
    return this.concertsService.getAvailability(id);
  }

  // ─────────────── Admin / Operation APIs ───────────────────────────────────

  @Get('admin/list')
  @ApiOperation({ summary: '[Admin] List all concerts regardless of status' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated list of all concerts' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.concertsService.findAll(page, limit);
  }

  @Post('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[Admin] Create a new concert (starts as DRAFT)' })
  @ApiResponse({ status: 201, description: 'Concert created in DRAFT status' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  create(@Body() dto: CreateConcertDto) {
    return this.concertsService.create(dto);
  }

  @Patch('admin/:id/status')
  @ApiOperation({
    summary: '[Admin] Update concert status',
    description: `
Publish a concert or change its status.

**Business rules**:
- Cannot publish a concert with no ticket categories
- PUBLISHED → CANCELLED transitions will prevent new bookings
    `,
  })
  @ApiParam({ name: 'id', type: String, description: 'Concert UUID' })
  @ApiResponse({ status: 200, description: 'Concert status updated' })
  @ApiResponse({ status: 400, description: 'Invalid transition (e.g., publish with no categories)' })
  @ApiResponse({ status: 404, description: 'Concert not found' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConcertStatusDto,
  ) {
    return this.concertsService.updateStatus(id, dto);
  }

  @Post('admin/:id/ticket-categories')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[Admin] Add a ticket category to a concert' })
  @ApiParam({ name: 'id', type: String, description: 'Concert UUID' })
  @ApiResponse({ status: 201, description: 'Ticket category added' })
  @ApiResponse({ status: 404, description: 'Concert not found' })
  addTicketCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTicketCategoryDto,
  ) {
    return this.concertsService.addTicketCategory(id, dto);
  }
}
