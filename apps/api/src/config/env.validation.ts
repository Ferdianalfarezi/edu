import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min, validateSync } from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1)
  PORT: number = 3000;

  @IsString()
  API_PREFIX: string = 'api/v1';

  // Database
  @IsString()
  DATABASE_URL: string;

  @IsNumber()
  @IsOptional()
  DB_POOL_MAX: number = 20;

  @IsNumber()
  @IsOptional()
  DB_POOL_MIN: number = 5;

  @IsNumber()
  @IsOptional()
  DB_IDLE_TIMEOUT: number = 30000;

  // Redis
  @IsString()
  @IsOptional()
  REDIS_URL: string;

  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD: string = '';

  // JWT
  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRATION: string = '24h';

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRATION: string = '7d';

  @IsString()
  @IsOptional()
  JWT_PARENT_ACCESS_EXPIRATION: string = '365d';

  // Firebase
  @IsString()
  FIREBASE_PROJECT_ID: string;

  @IsString()
  FIREBASE_PRIVATE_KEY: string;

  @IsString()
  FIREBASE_CLIENT_EMAIL: string;

  // S3
  @IsString()
  S3_ENDPOINT: string;

  @IsString()
  S3_BUCKET: string;

  @IsString()
  S3_ACCESS_KEY_ID: string;

  @IsString()
  S3_SECRET_ACCESS_KEY: string;

  @IsString()
  @IsOptional()
  S3_REGION: string = 'auto';

  // Rate Limiting
  @IsNumber()
  @IsOptional()
  THROTTLE_TTL: number = 60;

  @IsNumber()
  @IsOptional()
  THROTTLE_LIMIT: number = 60;

  // Gmail API (Service Account with domain-wide delegation)
  @IsString()
  GMAIL_SERVICE_ACCOUNT_EMAIL: string;

  @IsString()
  GMAIL_SERVICE_ACCOUNT_KEY: string;

  @IsString()
  GMAIL_SENDER_EMAIL: string;

  // App Version (ADR-004)
  @IsString()
  @IsOptional()
  MINIMUM_APP_VERSION: string = '1.0.0';
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation error:\n${errors.toString()}`);
  }

  return validatedConfig;
}
