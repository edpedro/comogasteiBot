import { NestFactory } from '@nestjs/core';
import * as nodeCrypto from 'crypto';

const g = globalThis as unknown as { crypto?: unknown };
if (!g.crypto) g.crypto = nodeCrypto as unknown;

async function bootstrap() {
  try {
    const { AppModule } = await import('./app.module');

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
