import { Test, TestingModule } from '@nestjs/testing';
import { CartoesController } from './cartoes.controller';
import { CartoesService } from './cartoes.service';

describe('CartoesController', () => {
  let controller: CartoesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CartoesController],
      providers: [
        {
          provide: CartoesService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CartoesController>(CartoesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
