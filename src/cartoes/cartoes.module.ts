import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartoesService } from './cartoes.service';
import { CartoesController } from './cartoes.controller';
import { Cartao } from './cartao.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cartao])],
  controllers: [CartoesController],
  providers: [CartoesService],
  exports: [CartoesService],
})
export class CartoesModule {}
