import { Test, TestingModule } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import { TelegramService } from './telegram.service';
import { CartoesService } from '../cartoes/cartoes.service';
import { ComprasService } from '../compras/compras.service';
import { PdfService } from '../pdf/pdf.service';

describe('TelegramService', () => {
  let service: TelegramService;
  let cartoesService: { findAll: jest.Mock; findOne: jest.Mock };
  let comprasService: {
    findByMonth: jest.Mock;
    findByCardAndMonth: jest.Mock;
    findByPurchaseMonth: jest.Mock;
    findByCardAndPurchaseMonth: jest.Mock;
  };

  beforeEach(async () => {
    cartoesService = { findAll: jest.fn(), findOne: jest.fn() };
    comprasService = {
      findByMonth: jest.fn(),
      findByCardAndMonth: jest.fn(),
      findByPurchaseMonth: jest.fn(),
      findByCardAndPurchaseMonth: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: getBotToken(),
          useValue: {
            telegram: { sendMessage: jest.fn() },
          },
        },
        { provide: CartoesService, useValue: cartoesService },
        {
          provide: ComprasService,
          useValue: {
            findByMonth: comprasService.findByMonth,
            findByCardAndMonth: comprasService.findByCardAndMonth,
            findByPurchaseMonth: comprasService.findByPurchaseMonth,
            findByCardAndPurchaseMonth:
              comprasService.findByCardAndPurchaseMonth,
            findByPurchaseDate: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
          },
        },
        { provide: PdfService, useValue: { generateInvoicePdf: jest.fn() } },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('inclui opção Todos no /listar', async () => {
    cartoesService.findAll.mockResolvedValueOnce([
      { id: 'card-a', nome: 'A', tipo: 'cartao' },
      { id: 'card-b', nome: 'B', tipo: 'cartao' },
    ]);

    const ctx: any = { reply: jest.fn() };
    await service.listarFaturas(ctx);

    const [, markup] = ctx.reply.mock.calls[0];
    const inline = markup.reply_markup.inline_keyboard.flat();
    const callbackData = inline.map((b: any) => b.callback_data);
    expect(callbackData).toContain('list_card:ALL');
  });

  it('no /listar Todos usa findByMonth', async () => {
    comprasService.findByPurchaseMonth.mockResolvedValueOnce([
      {
        id: 'c1',
        tipo: 'CREDITO',
        cartao: { nome: 'A' },
        dataCompra: '2026-03-01',
        descricao: 'X',
        valorParcela: 10,
        nome: 'N',
      },
      {
        id: 'c2',
        tipo: 'CREDITO',
        cartao: { nome: 'B' },
        dataCompra: '2026-03-02',
        descricao: 'Y',
        valorParcela: 20,
        nome: 'N',
      },
    ]);

    const ctx: any = {
      match: ['list_card:ALL', 'ALL'],
      reply: jest.fn(),
      answerCbQuery: jest.fn(),
    };

    await service.onListCardSelect(ctx);

    expect(comprasService.findByPurchaseMonth).toHaveBeenCalledTimes(1);
    expect(comprasService.findByCardAndPurchaseMonth).not.toHaveBeenCalled();
  });
});
