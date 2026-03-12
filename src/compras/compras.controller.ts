import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
} from '@nestjs/common';
import { ComprasService } from './compras.service';
import { Compra } from './compra.entity';

@Controller('compras')
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  @Post()
  create(@Body() data: Partial<Compra>) {
    return this.comprasService.create(data);
  }

  @Get()
  findAll() {
    return this.comprasService.findAll();
  }

  @Get('mes/:month')
  findByMonth(@Param('month') month: string) {
    return this.comprasService.findByMonth(month);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.comprasService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: Partial<Compra>) {
    return this.comprasService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.comprasService.remove(id);
  }
}
