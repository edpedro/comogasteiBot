import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { CartoesModule } from '../cartoes/cartoes.module';
import { ComprasModule } from '../compras/compras.module';
import { PdfService } from '../pdf/pdf.service';

@Module({
  imports: [CartoesModule, ComprasModule],
  providers: [TelegramService, PdfService],
})
export class TelegramModule {}
