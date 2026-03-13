import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Compra } from './compra.entity';
import { Cartao } from '../cartoes/cartao.entity';
import { CartoesService } from '../cartoes/cartoes.service';
import { randomUUID } from 'crypto';

@Injectable()
export class ComprasService {
  constructor(
    @InjectRepository(Compra)
    private readonly compraRepository: Repository<Compra>,
    private readonly cartoesService: CartoesService,
  ) {}

  async create(data: Partial<Compra>): Promise<Compra[]> {
    const isCartao = !data.tipo || ['CREDITO', 'DEBITO'].includes(data.tipo);

    if (isCartao && !data.cartaoId) {
      throw new Error('Cartao ID is required for Credit/Debit');
    }

    let cartao: Cartao | null = null;
    if (data.cartaoId) {
      cartao = await this.cartoesService.findOne(data.cartaoId);
    }

    const compras: Compra[] = [];
    const valorTotal = Number(data.valor);
    const parcelas = data.parcelas || 1;
    const valorParcela = valorTotal / parcelas;
    const grupoId = randomUUID();

    const dataCompraStr =
      typeof data.dataCompra === 'string'
        ? String(data.dataCompra).slice(0, 10)
        : data.dataCompra instanceof Date
          ? `${data.dataCompra.getFullYear()}-${String(data.dataCompra.getMonth() + 1).padStart(2, '0')}-${String(data.dataCompra.getDate()).padStart(2, '0')}`
          : null;

    if (!dataCompraStr) {
      throw new Error('Data da compra is required');
    }

    const [purchaseYearStr, purchaseMonthStr, purchaseDayStr] =
      dataCompraStr.split('-');
    const purchaseYear = Number(purchaseYearStr);
    const purchaseMonth = Number(purchaseMonthStr);
    const purchaseDay = Number(purchaseDayStr);

    const addMonthsToYearMonth = (
      year: number,
      month: number,
      delta: number,
    ) => {
      const total = year * 12 + (month - 1) + delta;
      const newYear = Math.floor(total / 12);
      const newMonth = (total % 12) + 1;
      return { year: newYear, month: newMonth };
    };

    let refYear = purchaseYear;
    let refMonth = purchaseMonth;

    // Only adjust for closing date if it's a credit card purchase
    if (
      cartao &&
      cartao.tipo === 'cartao' &&
      cartao.dataFechamento &&
      isCartao
    ) {
      const diaCompra = purchaseDay;
      if (diaCompra > cartao.dataFechamento) {
        const next = addMonthsToYearMonth(refYear, refMonth, 1);
        refYear = next.year;
        refMonth = next.month;
      }
    }

    for (let i = 0; i < parcelas; i++) {
      const ym = addMonthsToYearMonth(refYear, refMonth, i);
      const mesReferenciaStr = `${ym.year}-${String(ym.month).padStart(2, '0')}-01`;
      const compra = this.compraRepository.create({
        ...data,
        grupoId,
        valorParcela: valorParcela,
        parcelas: parcelas,
        parcelaAtual: i + 1,
        dataCompra: dataCompraStr as any,
        mesReferencia: mesReferenciaStr as any,
      });
      compras.push(await this.compraRepository.save(compra));
    }

    return compras;
  }

  async findAll(): Promise<Compra[]> {
    return this.compraRepository.find({ relations: ['cartao'] });
  }

  async findByMonth(month: string): Promise<Compra[]> {
    // month format YYYY-MM
    const date = `${month}-01`;
    return this.compraRepository.find({
      where: { mesReferencia: date as any },
      relations: ['cartao'],
    });
  }

  async findByCardAndMonth(cardName: string, month: string): Promise<Compra[]> {
    const date = `${month}-01`;
    const query = this.compraRepository
      .createQueryBuilder('compra')
      .leftJoinAndSelect('compra.cartao', 'cartao')
      .where('compra.mesReferencia = :date', { date });

    if (cardName) {
      if (
        cardName.toUpperCase() === 'DINHEIRO' ||
        cardName.toUpperCase() === 'PIX'
      ) {
        query.andWhere('compra.tipo = :tipo', { tipo: cardName.toUpperCase() });
      } else {
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            cardName,
          );
        if (isUuid) {
          query.andWhere('cartao.id = :cardId', { cardId: cardName });
        } else {
          query.andWhere('cartao.nome ILIKE :cardName', {
            cardName: `%${cardName}%`,
          });
        }
      }
    }

    return query.getMany();
  }

  async findByPurchaseDate(date: string): Promise<Compra[]> {
    return this.compraRepository
      .createQueryBuilder('compra')
      .leftJoinAndSelect('compra.cartao', 'cartao')
      .where('compra.dataCompra = :date', { date })
      .orderBy('compra.dataCompra', 'ASC')
      .addOrderBy('compra.horaCompra', 'ASC')
      .addOrderBy('compra.id', 'ASC')
      .getMany();
  }

  async findOne(id: string): Promise<Compra> {
    const compra = await this.compraRepository.findOne({
      where: { id },
      relations: ['cartao'],
    });
    if (!compra) {
      throw new NotFoundException(`Compra with ID ${id} not found`);
    }
    return compra;
  }

  async update(id: string, data: Partial<Compra>): Promise<Compra> {
    const compra = await this.findOne(id);

    // If updating shared fields, update all in group
    if (compra.grupoId && (data.descricao || data.nome || data.valor)) {
      // Find all in group
      const group = await this.compraRepository.find({
        where: { grupoId: compra.grupoId },
      });

      // If value changed, recalculate installments
      const novoValorParcela =
        data.valor !== undefined
          ? Number(data.valor) / Math.max(1, group.length)
          : Number(compra.valorParcela);

      const updates = group.map((c) => {
        Object.assign(c, {
          ...data,
          valorParcela: novoValorParcela,
        });
        // Don't update mesReferencia/parcelaAtual automatically as that's complex
        return this.compraRepository.save(c);
      });

      await Promise.all(updates);
      return this.findOne(id); // Return updated single record
    }

    if (data.valor !== undefined) {
      Object.assign(data, {
        valorParcela: Number(data.valor) / Math.max(1, compra.parcelas || 1),
      });
    }

    Object.assign(compra, data);
    return this.compraRepository.save(compra);
  }

  async remove(id: string): Promise<void> {
    const compra = await this.findOne(id);

    if (compra.grupoId) {
      const group = await this.compraRepository.find({
        where: { grupoId: compra.grupoId },
      });
      await this.compraRepository.remove(group);
    } else {
      await this.compraRepository.remove(compra);
    }
  }
}
