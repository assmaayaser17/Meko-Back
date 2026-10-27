import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Every business error has a stable `code` the frontend can switch on,
 * and an Egyptian-Arabic `message` that can be shown to the customer as-is.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    extra?: Record<string, unknown>,
  ) {
    super({ statusCode: status, code, message, ...extra }, status);
  }
}

export const Errors = {
  notFound: (what = 'المطلوب') => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} مش موجود`),
  invalid: (code: string, message: string, extra?: Record<string, unknown>) =>
    new AppError(HttpStatus.BAD_REQUEST, code, message, extra),
  conflict: (code: string, message: string, extra?: Record<string, unknown>) =>
    new AppError(HttpStatus.CONFLICT, code, message, extra),
  unauthorized: () => new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'محتاجين كود الطلب ورقم الموبايل تاني'),
  accessDenied: () =>
    new AppError(HttpStatus.NOT_FOUND, 'ORDER_ACCESS_DENIED', 'الكود أو رقم الموبايل مش صح، راجعيهم وجربي تاني'),
};
