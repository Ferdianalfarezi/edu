import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

/**
 * NestJS pipe that validates a cursor query parameter.
 * Accepts either a valid UUID v4 string or null/undefined (no cursor = first page).
 *
 * Usage:
 * ```typescript
 * @Get()
 * list(@Query('cursor', ParseCursorPipe) cursor?: string) { ... }
 * ```
 *
 * Requirements: 35.1, 35.2
 */
@Injectable()
export class ParseCursorPipe implements PipeTransform<string | undefined, string | undefined> {
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  transform(value: string | undefined): string | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (!ParseCursorPipe.UUID_REGEX.test(value)) {
      throw new BadRequestException('Cursor harus berupa UUID yang valid atau tidak diisi');
    }

    return value;
  }
}
