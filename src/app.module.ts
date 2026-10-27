import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { AnalyticsController, AnalyticsService } from './analytics/analytics';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { env } from './config/env';
import { CustomerOrderGuard, CustomerTokenService } from './customer/customer-auth';
import { MyOrderController } from './customer/my-order.controller';
import { MyOrderService } from './customer/my-order.service';
import { Db, DbModule, InjectDb } from './db/db.module';
import { CleanupService } from './jobs/cleanup.service';
import { OrderStateService } from './orders/order-state';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { MockCheckoutController } from './payments/mock-checkout.controller';
import { PaymentsController } from './payments/payments.controller';
import { PAYMENT_PROVIDER, PaymentsService } from './payments/payments.service';
import { createPaymentProvider } from './payments/providers';
import { PricingService } from './pricing/pricing.service';
import { SettingsService } from './settings/settings.service';
import { StorageService } from './storage/storage.service';
import { FilesController, UploadsController } from './uploads/uploads.controller';
import { UploadsService } from './uploads/uploads.service';

@Controller('health')
class HealthController {
  constructor(@InjectDb() private readonly db: Db) {}
  @Get()
  async health() {
    await this.db.execute(sql`select 1`);
    return { ok: true };
  }
}

@Module({
  imports: [
    DbModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    JwtModule.register({ secret: env.jwtSecret, signOptions: { expiresIn: env.customerTokenTtl as any } }),
  ],
  controllers: [
    HealthController,
    CatalogController,
    OrdersController,
    UploadsController,
    FilesController,
    MyOrderController,
    PaymentsController,
    MockCheckoutController,
    AnalyticsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: PAYMENT_PROVIDER, useFactory: createPaymentProvider },
    SettingsService,
    CatalogService,
    PricingService,
    StorageService,
    UploadsService,
    OrderStateService,
    CustomerTokenService,
    CustomerOrderGuard,
    OrdersService,
    PaymentsService,
    MyOrderService,
    AnalyticsService,
    CleanupService,
  ],
})
export class AppModule {}
