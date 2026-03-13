import { NestFactory } from '@nestjs/core';
import * as nodeCrypto from 'crypto';

const g = globalThis as unknown as { crypto?: unknown };
if (!g.crypto) g.crypto = nodeCrypto as unknown;

async function bootstrap() {
  try {
    const importAppModule = async () => {
      const maxAttempts = 25;
      const delayMs = 200;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await import('./app.module');
        } catch (error: any) {
          const isModuleNotFound =
            error &&
            (error.code === 'MODULE_NOT_FOUND' ||
              String(error.message || '').includes('Cannot find module'));

          if (!isModuleNotFound || attempt === maxAttempts) {
            throw error;
          }

          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      return await import('./app.module');
    };

    const { AppModule } = await importAppModule();

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
