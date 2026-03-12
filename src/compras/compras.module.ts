import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComprasService } from './compras.service';
import { ComprasController } from './compras.controller';
import { Compra } from './compra.entity';
import { CartoesModule } from '../cartoes/cartoes.module';

@Module({
  imports: [TypeOrmModule.forFeature([Compra]), CartoesModule],
  controllers: [ComprasController],
  providers: [ComprasService],
  exports: [ComprasService],
})
export class ComprasModule {}
