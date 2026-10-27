import { Controller, HttpCode, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Called by the payment gateway (server to server), never by the frontend. */
  @Post('webhook/:provider')
  @HttpCode(200)
  @SkipThrottle()
  webhook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>) {
    return this.paymentsService.handleWebhook(provider, req.rawBody, req.headers);
  }
}
