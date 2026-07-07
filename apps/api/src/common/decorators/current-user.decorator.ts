import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '../../modules/auth/interfaces';

/**
 * Parameter decorator that extracts the authenticated user from the request.
 * Optionally accepts a property key to extract a specific field.
 *
 * @example
 * ```ts
 * @Get('/profile')
 * getProfile(@CurrentUser() user: RequestUser) { ... }
 *
 * @Get('/profile')
 * getProfile(@CurrentUser('id') userId: string) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as RequestUser;

    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);
