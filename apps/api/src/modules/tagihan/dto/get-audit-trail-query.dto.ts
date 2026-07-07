import { IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Query DTO for GET /audit-trail
 * Supports cursor-based pagination (cursor = audit trail entry ID, sorted newest first).
 *
 * Requirements: 29.3, 29.4
 */
export class GetAuditTrailQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
