import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccessOrderDto, CreateOrderDto, QuoteDto } from './orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /** Live price while the customer chooses (piece + style + options + governorate). */
  @Post('quote')
  @HttpCode(200)
  quote(@Body() dto: QuoteDto) {
    return this.ordersService.quote(dto);
  }

  /** Creates the order (status PENDING_PAYMENT) and returns its code + a customer token. */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  /** Unlock an existing order with code + phone (WhatsApp link, tracking page, new device…). */
  @Post('access')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  access(@Body() dto: AccessOrderDto) {
    return this.ordersService.access(dto.code, dto.phone);
  }
}
