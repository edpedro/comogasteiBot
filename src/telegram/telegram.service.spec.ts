import { Test, TestingModule } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import { TelegramService } from './telegram.service';
import { CartoesService } from '../cartoes/cartoes.service';
import { ComprasService } from '../compras/compras.service';
import { PdfService } from '../pdf/pdf.service';

describe('TelegramService', () => {
  let service: TelegramService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: getBotToken(),
          useValue: {
            telegram: { sendMessage: jest.fn() },
          },
        },
        { provide: CartoesService, useValue: { findAll: jest.fn() } },
        {
          provide: ComprasService,
          useValue: {
            findByMonth: jest.fn(),
            findByCardAndMonth: jest.fn(),
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
});
