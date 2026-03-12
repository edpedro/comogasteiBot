import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cartao } from './cartao.entity';

@Injectable()
export class CartoesService {
  constructor(
    @InjectRepository(Cartao)
    private readonly cartaoRepository: Repository<Cartao>,
  ) {}

  async create(data: Partial<Cartao>): Promise<Cartao> {
    const cartao = this.cartaoRepository.create(data);
    return this.cartaoRepository.save(cartao);
  }

  async findAll(): Promise<Cartao[]> {
    return this.cartaoRepository.find();
  }

  async findOne(id: string): Promise<Cartao> {
    const cartao = await this.cartaoRepository.findOne({ where: { id } });
    if (!cartao) {
      throw new NotFoundException(`Cartao with ID ${id} not found`);
    }
    return cartao;
  }

  async findByName(nome: string): Promise<Cartao | null> {
    return this.cartaoRepository.findOne({ where: { nome } });
  }

  async update(id: string, data: Partial<Cartao>): Promise<Cartao> {
    const cartao = await this.findOne(id);
    Object.assign(cartao, data);
    return this.cartaoRepository.save(cartao);
  }

  async remove(id: string): Promise<void> {
    const cartao = await this.findOne(id);
    await this.cartaoRepository.remove(cartao);
  }
}
