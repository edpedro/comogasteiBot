import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CartoesService } from './cartoes.service';
import { Cartao } from './cartao.entity';

describe('CartoesService', () => {
  let service: CartoesService;
  let cartaoRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    cartaoRepository = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      remove: jest.fn(async (v) => v),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartoesService,
        { provide: getRepositoryToken(Cartao), useValue: cartaoRepository },
      ],
    }).compile();

    service = module.get<CartoesService>(CartoesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
