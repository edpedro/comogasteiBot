import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ComprasService } from './compras.service';
import { Compra } from './compra.entity';
import { CartoesService } from '../cartoes/cartoes.service';

describe('ComprasService', () => {
  let service: ComprasService;
  let compraRepository: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let cartoesService: { findOne: jest.Mock; findAll: jest.Mock };

  beforeEach(async () => {
    compraRepository = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
      find: jest.fn(async () => []),
    };
    cartoesService = {
      findOne: jest.fn(),
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComprasService,
        { provide: getRepositoryToken(Compra), useValue: compraRepository },
        { provide: CartoesService, useValue: cartoesService },
      ],
    }).compile();

    service = module.get<ComprasService>(ComprasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('salva a compra no cartão informado', async () => {
    cartoesService.findOne.mockResolvedValue({
      id: 'card-a',
      tipo: 'cartao',
      dataFechamento: 10,
    });

    const saved: any[] = [];
    compraRepository.save.mockImplementation(async (v) => {
      saved.push(v);
      return { ...v, id: `compra-${saved.length}` };
    });

    await service.create({
      tipo: 'CREDITO',
      cartaoId: 'card-a',
      valor: 100,
      parcelas: 1,
      nome: 'Edu',
      descricao: 'Teste',
      dataCompra: '2026-03-10',
    } as any);

    expect(cartoesService.findOne).toHaveBeenCalledWith('card-a');
    expect(saved[0].cartaoId).toBe('card-a');
    expect(saved[0].cartao?.id).toBe('card-a');
  });

  it('não reaproveita cartaoId quando tipo não é cartão', async () => {
    const saved: any[] = [];
    compraRepository.save.mockImplementation(async (v) => {
      saved.push(v);
      return { ...v, id: `compra-${saved.length}` };
    });

    await service.create({
      tipo: 'PIX',
      cartaoId: 'card-a',
      valor: 50,
      parcelas: 1,
      nome: 'Edu',
      descricao: 'Pix',
      dataCompra: '2026-03-10',
    } as any);

    expect(cartoesService.findOne).not.toHaveBeenCalled();
    expect(saved[0].cartaoId).toBeNull();
    expect(saved[0].cartao).toBeNull();
  });

  it('permite salvar em cartões diferentes', async () => {
    const saved: any[] = [];
    compraRepository.save.mockImplementation(async (v) => {
      saved.push(v);
      return { ...v, id: `compra-${saved.length}` };
    });

    cartoesService.findOne.mockResolvedValueOnce({
      id: 'card-a',
      tipo: 'cartao',
      dataFechamento: 10,
    });
    await service.create({
      tipo: 'CREDITO',
      cartaoId: 'card-a',
      valor: 10,
      parcelas: 1,
      nome: 'Edu',
      descricao: 'A',
      dataCompra: '2026-03-10',
    } as any);

    cartoesService.findOne.mockResolvedValueOnce({
      id: 'card-b',
      tipo: 'cartao',
      dataFechamento: 10,
    });
    await service.create({
      tipo: 'CREDITO',
      cartaoId: 'card-b',
      valor: 20,
      parcelas: 1,
      nome: 'Edu',
      descricao: 'B',
      dataCompra: '2026-03-10',
    } as any);

    const cartaoIds = saved.map((s) => s.cartaoId);
    expect(cartaoIds).toEqual(['card-a', 'card-b']);
  });

  it('faz fallback para o dia anterior ao buscar por data', async () => {
    compraRepository.find.mockResolvedValueOnce([
      {
        id: 'c1',
        dataCompra: '2026-03-11',
        horaCompra: '10:00',
      },
    ]);

    const result = await service.findByPurchaseDate('2026-03-12');
    expect(result.map((r) => r.id)).toEqual(['c1']);
  });

  it('prioriza resultados do dia exato quando existem', async () => {
    compraRepository.find.mockResolvedValueOnce([
      { id: 'c1', dataCompra: '2026-03-11', horaCompra: '10:00' },
      { id: 'c2', dataCompra: '2026-03-12', horaCompra: '09:00' },
    ]);

    const result = await service.findByPurchaseDate('2026-03-12');
    expect(result.map((r) => r.id)).toEqual(['c2']);
  });

  it('busca cartão ignorando acentos no nome', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    };
    (compraRepository as any).createQueryBuilder = jest.fn(() => qb);

    cartoesService.findAll.mockResolvedValueOnce([
      { id: 'id-itau', nome: 'Itaú' },
      { id: 'id-santander', nome: 'Santander' },
    ]);

    await service.findByCardAndMonth('itau', '2026-03');

    expect(cartoesService.findAll).toHaveBeenCalledTimes(1);
    expect(qb.andWhere).toHaveBeenCalledWith('cartao.id IN (:...cardIds)', {
      cardIds: ['id-itau'],
    });
  });

  it('lista compras por mês de compra (dataCompra)', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    };
    (compraRepository as any).createQueryBuilder = jest.fn(() => qb);

    await service.findByPurchaseMonth('2026-03');
    expect(qb.where).toHaveBeenCalledWith('compra.dataCompra >= :start', {
      start: '2026-03-01',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('compra.dataCompra < :end', {
      end: '2026-04-01',
    });
  });
});
