import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl =
          configService.get<string>('DATABASE_URL') ||
          configService.get<string>('DB_URL');

        const host = configService.get<string>('DB_HOST', 'localhost');
        const portRaw = configService.get<string | number>('DB_PORT', 5432);
        const port = typeof portRaw === 'number' ? portRaw : Number(portRaw);

        const sslModeRaw =
          configService.get<string>('DB_SSL_MODE') ||
          configService.get<string>('DB_SSL') ||
          '';
        const sslMode = String(sslModeRaw).trim().toLowerCase();

        const urlSslMode = (() => {
          if (!databaseUrl) return null;
          try {
            const u = new URL(databaseUrl);
            return u.searchParams.get('sslmode');
          } catch {
            return null;
          }
        })();

        const isSslExplicitlyEnabled =
          sslMode === 'require' ||
          sslMode === 'true' ||
          sslMode === '1' ||
          sslMode === 'on' ||
          sslMode === 'yes' ||
          (urlSslMode &&
            ['require', 'verify-ca', 'verify-full'].includes(
              urlSslMode.toLowerCase(),
            ));

        const isSslExplicitlyDisabled =
          sslMode === 'disable' ||
          sslMode === 'false' ||
          sslMode === '0' ||
          sslMode === 'off' ||
          sslMode === 'no' ||
          (urlSslMode && urlSslMode.toLowerCase() === 'disable');

        const ssl = isSslExplicitlyEnabled
          ? { rejectUnauthorized: false }
          : isSslExplicitlyDisabled
            ? false
            : false;

        return {
          type: 'postgres' as const,
          ...(databaseUrl
            ? { url: databaseUrl }
            : {
                host,
                port,
                username: configService.get<string>('DB_USERNAME', 'postgres'),
                password: configService.get<string>('DB_PASSWORD', 'postgres'),
                database: configService.get<string>('DB_NAME', 'finbot'),
              }),
          entities: [__dirname + '/../**/*.entity{.ts,.js}'],
          synchronize: true,
          ssl,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
