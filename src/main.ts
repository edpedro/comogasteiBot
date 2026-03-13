import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as nodeCrypto from 'crypto';

async function bootstrap() {
  try {
    const g = globalThis as unknown as { crypto?: unknown };
    if (!g.crypto) g.crypto = nodeCrypto as unknown;

    const app = await NestFactory.create(AppModule);
    app.enableCors();
    await app.listen(process.env.PORT ?? 3000);
    console.log(`Application is running on: ${await app.getUrl()}`);
  } catch (error) {
    console.error('Error during bootstrap:', error);
    process.exit(1);
  }
}
bootstrap();
