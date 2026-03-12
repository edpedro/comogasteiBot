import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
} from '@nestjs/common';
import { CartoesService } from './cartoes.service';
import { Cartao } from './cartao.entity';

@Controller('cartoes')
export class CartoesController {
  constructor(private readonly cartoesService: CartoesService) {}

  @Post()
  create(@Body() data: Partial<Cartao>) {
    return this.cartoesService.create(data);
  }

  @Get()
  findAll() {
    return this.cartoesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cartoesService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: Partial<Cartao>) {
    return this.cartoesService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cartoesService.remove(id);
  }
}
