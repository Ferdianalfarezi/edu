import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use pino as the application logger (structured JSON in production)
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);

  // Global API prefix with versioning per ADR-004
  // Health endpoints are excluded (they sit at root /health)
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/live'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS configuration
  const allowedOrigins = configService.get<string>('CORS_ORIGINS');
  app.enableCors({
    origin: allowedOrigins ? allowedOrigins.split(',').map((o) => o.trim()) : true, // allow all in development
    credentials: true,
  });

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Application running on port ${port}`, 'Bootstrap');
}

bootstrap();
