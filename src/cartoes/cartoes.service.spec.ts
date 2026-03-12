import { Test, TestingModule } from '@nestjs/testing';
import { CartoesService } from './cartoes.service';

describe('CartoesService', () => {
  let service: CartoesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CartoesService],
    }).compile();

    service = module.get<CartoesService>(CartoesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
