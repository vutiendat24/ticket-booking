import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConcertsController } from './concerts.controller';
import { ConcertsService } from './concerts.service';
import { Concert } from '../../entities/concert.entity';
import { TicketCategory } from '../../entities/ticket-category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Concert, TicketCategory])],
  controllers: [ConcertsController],
  providers: [ConcertsService],
  exports: [ConcertsService],
})
export class ConcertsModule {}
