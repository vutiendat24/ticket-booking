import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Concert, ConcertStatus } from '../../entities/concert.entity';
import { TicketCategory } from '../../entities/ticket-category.entity';
import { CreateConcertDto, UpdateConcertStatusDto } from './dto/create-concert.dto';
import { AddTicketCategoryDto } from './dto/add-ticket-category.dto';

@Injectable()
export class ConcertsService {
  constructor(
    @InjectRepository(Concert)
    private readonly concertRepo: Repository<Concert>,
    @InjectRepository(TicketCategory)
    private readonly ticketCategoryRepo: Repository<TicketCategory>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Public / Customer APIs ───────────────────────────────────────────────

  /** List all published concerts (paginated) */
  async findPublished(page = 1, limit = 10) {
    const [concerts, total] = await this.concertRepo.findAndCount({
      where: { status: ConcertStatus.PUBLISHED },
      relations: ['ticketCategories'],
      order: { eventDate: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: concerts,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Get a single concert with its ticket categories */
  async findOne(id: string): Promise<Concert> {
    const concert = await this.concertRepo.findOne({
      where: { id },
      relations: ['ticketCategories'],
    });
    if (!concert) throw new NotFoundException(`Concert ${id} not found`);
    return concert;
  }

  // ─── Admin / Operation APIs ──────────────────────────────────────────────

  /** List all concerts regardless of status (for admin dashboard) */
  async findAll(page = 1, limit = 20) {
    const [concerts, total] = await this.concertRepo.findAndCount({
      relations: ['ticketCategories'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: concerts,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Create a new concert (starts in DRAFT status) */
  async create(dto: CreateConcertDto): Promise<Concert> {
    const concert = this.concertRepo.create({
      ...dto,
      eventDate: new Date(dto.eventDate),
      status: ConcertStatus.DRAFT,
    });
    return this.concertRepo.save(concert);
  }

  /** Publish or change status of a concert */
  async updateStatus(id: string, dto: UpdateConcertStatusDto): Promise<Concert> {
    const concert = await this.findOne(id);

    // Business rule: can only publish if there is at least one ticket category
    if (dto.status === ConcertStatus.PUBLISHED && concert.ticketCategories.length === 0) {
      throw new BadRequestException('Cannot publish a concert with no ticket categories');
    }

    concert.status = dto.status;
    return this.concertRepo.save(concert);
  }

  /** Add a ticket category to a concert */
  async addTicketCategory(concertId: string, dto: AddTicketCategoryDto): Promise<TicketCategory> {
    const concert = await this.concertRepo.findOne({ where: { id: concertId } });
    if (!concert) throw new NotFoundException(`Concert ${concertId} not found`);

    const category = this.ticketCategoryRepo.create({
      ...dto,
      concertId,
      soldQuantity: 0,
    });
    return this.ticketCategoryRepo.save(category);
  }

  /** Get ticket availability for a concert */
  async getAvailability(concertId: string) {
    const concert = await this.concertRepo.findOne({
      where: { id: concertId },
      relations: ['ticketCategories'],
    });
    if (!concert) throw new NotFoundException(`Concert ${concertId} not found`);

    return {
      concertId: concert.id,
      concertName: concert.name,
      eventDate: concert.eventDate,
      status: concert.status,
      categories: concert.ticketCategories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        price: cat.price,
        totalQuantity: cat.totalQuantity,
        soldQuantity: cat.soldQuantity,
        availableQuantity: cat.totalQuantity - cat.soldQuantity,
        isSoldOut: cat.soldQuantity >= cat.totalQuantity,
      })),
    };
  }
}
