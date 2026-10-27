import 'reflect-metadata';
import { BadRequestException, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';

function flatten(errors: ValidationError[], parent = ''): { field: string; problems: string[] }[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, problems: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

async function bootstrap() {
  // rawBody is required to verify payment-gateway signatures.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.set('trust proxy', 1); // correct client IPs behind a load balancer (rate limiting)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // the dev mock checkout page posts a form and redirects back to the frontend
      contentSecurityPolicy: { directives: { formAction: ["'self'", ...env.frontendOrigins] } },
    }),
  );
  app.enableCors({ origin: env.frontendOrigins, credentials: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'في بيانات ناقصة أو مش مظبوطة',
          fields: flatten(errors),
        }),
    }),
  );
  app.enableShutdownHooks();
  await app.listen(env.port);
  Logger.log(`MEKO API on ${env.appUrl}/api/v1 (payments: ${env.paymentProvider})`, 'Bootstrap');
}

bootstrap();
