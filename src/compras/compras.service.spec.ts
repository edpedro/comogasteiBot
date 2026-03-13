import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ComprasService } from './compras.service';
import { Compra } from './compra.entity';
import { CartoesService } from '../cartoes/cartoes.service';

describe('ComprasService', () => {
  let service: ComprasService;
  let compraRepository: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let cartoesService: { findOne: jest.Mock };

  beforeEach(async () => {
    compraRepository = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
      find: jest.fn(async () => []),
    };
    cartoesService = {
      findOne: jest.fn(),
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
});
