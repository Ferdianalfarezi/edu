import { applyDecorators, UseGuards } from '@nestjs/common';
import { PhoneRateLimitGuard } from '../guards/phone-rate-limit.guard';
import { UploadRateLimitGuard } from '../guards/upload-rate-limit.guard';
import { BillingRateLimitGuard } from '../guards/billing-rate-limit.guard';

/**
 * Apply phone login rate limiting: 5 attempts per phone per hour.
 * Use on POST /auth/login for phone-based authentication.
 */
export function PhoneRateLimit() {
  return applyDecorators(UseGuards(PhoneRateLimitGuard));
}

/**
 * Apply file upload rate limiting: 10 requests per 5 minutes per user.
 * Use on file upload endpoints.
 */
export function UploadRateLimit() {
  return applyDecorators(UseGuards(UploadRateLimitGuard));
}

/**
 * Apply billing generation rate limiting: 2 requests per minute per tenant.
 * Use on POST /tagihan/generate.
 */
export function BillingRateLimit() {
  return applyDecorators(UseGuards(BillingRateLimitGuard));
}
