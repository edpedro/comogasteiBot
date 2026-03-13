import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, In, Repository } from 'typeorm';
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

  private shiftDateKey(dateKey: string, deltaDays: number) {
    const [y, m, d] = String(dateKey)
      .trim()
      .slice(0, 10)
      .split('-')
      .map((v) => Number(v));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    const year = dt.getUTCFullYear();
    const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dt.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async create(data: Partial<Compra>): Promise<Compra[]> {
    const { cartao: _ignoredCartao, ...incoming } = (data ?? {}) as any;

    const tipoUpper = incoming.tipo
      ? String(incoming.tipo).trim().toUpperCase()
      : 'CREDITO';
    const tipo = (['CREDITO', 'DEBITO', 'DINHEIRO', 'PIX'] as const).includes(
      tipoUpper as any,
    )
      ? (tipoUpper as Compra['tipo'])
      : null;

    if (!tipo) {
      throw new BadRequestException('Tipo inválido');
    }

    const isCartao = ['CREDITO', 'DEBITO'].includes(tipo);

    const cartaoIdRaw =
      incoming.cartaoId !== undefined && incoming.cartaoId !== null
        ? String(incoming.cartaoId).trim()
        : null;

    if (!isCartao && cartaoIdRaw) {
      incoming.cartaoId = null;
    }

    if (isCartao && !cartaoIdRaw) {
      throw new BadRequestException(
        'cartaoId é obrigatório para compras no cartão',
      );
    }

    let cartao: Cartao | null = null;
    if (isCartao && cartaoIdRaw) {
      cartao = await this.cartoesService.findOne(cartaoIdRaw);
    }

    const compras: Compra[] = [];
    const valorTotal = Number(incoming.valor);
    if (!Number.isFinite(valorTotal)) {
      throw new BadRequestException('valor inválido');
    }

    const parcelasRaw = Number(incoming.parcelas ?? 1);
    const parcelas =
      Number.isFinite(parcelasRaw) && parcelasRaw > 0
        ? Math.trunc(parcelasRaw)
        : 1;
    const valorParcela = valorTotal / parcelas;
    const grupoId = randomUUID();

    const dataCompraStr =
      typeof incoming.dataCompra === 'string'
        ? String(incoming.dataCompra).slice(0, 10)
        : incoming.dataCompra instanceof Date
          ? `${incoming.dataCompra.getFullYear()}-${String(incoming.dataCompra.getMonth() + 1).padStart(2, '0')}-${String(incoming.dataCompra.getDate()).padStart(2, '0')}`
          : null;

    if (!dataCompraStr) {
      throw new BadRequestException('dataCompra é obrigatória');
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
      const compraData: DeepPartial<Compra> = {
        ...(incoming as DeepPartial<Compra>),
        grupoId,
        valorParcela: valorParcela,
        parcelas: parcelas,
        parcelaAtual: i + 1,
        dataCompra: dataCompraStr,
        mesReferencia: mesReferenciaStr,
        tipo,
        cartaoId: cartao ? cartao.id : null,
        cartao: cartao ?? null,
      };
      const compra = this.compraRepository.create(compraData);
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
    const normalized = String(date).trim().slice(0, 10);
    const fallback = this.shiftDateKey(normalized, -1);

    const compras = await this.compraRepository.find({
      where: { dataCompra: In([normalized, fallback] as any) },
      relations: ['cartao'],
    });

    const matchKey = (value: unknown) => String(value).slice(0, 10);
    const exact = compras.filter((c) => matchKey(c.dataCompra) === normalized);
    const chosen =
      exact.length > 0
        ? exact
        : compras.filter((c) => matchKey(c.dataCompra) === fallback);

    return chosen.sort((a, b) => {
      const aDate = matchKey(a.dataCompra);
      const bDate = matchKey(b.dataCompra);
      if (aDate !== bDate) return aDate.localeCompare(bDate);

      const aTime = String(a.horaCompra || '');
      const bTime = String(b.horaCompra || '');
      if (aTime !== bTime) return aTime.localeCompare(bTime);

      return String(a.id).localeCompare(String(b.id));
    });
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
