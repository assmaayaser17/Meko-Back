import { Body, Controller, HttpCode, Injectable, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsObject, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { eq } from 'drizzle-orm';
import { normalizeOrderCode } from '../common/order-code';
import { Db, DbOrTx, InjectDb } from '../db/db.module';
import { analyticsEvents, orders } from '../db/schema';

/**
 * Journey events behind the KPIs in the plan:
 * Completion rate, drop-off at payment, approval rate, edits, WhatsApp hand-offs.
 */
export const EVENT_NAMES = [
  'story_started',
  'customization_completed',
  'review_reached',
  'payment_reached',
  'payment_started',
  'order_created', // server
  'deposit_paid', // server
  'design_viewed', // server
  'design_approved', // server
  'edit_requested', // server
  'whatsapp_clicked',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];
const CLIENT_EVENTS: EventName[] = [
  'story_started',
  'customization_completed',
  'review_reached',
  'payment_reached',
  'payment_started',
  'whatsapp_clicked',
];

@Injectable()
export class AnalyticsService {
  constructor(@InjectDb() private readonly db: Db) {}

  async track(name: EventName, sessionId: string, opts: { orderId?: string; props?: object } = {}, tx: DbOrTx = this.db) {
    await tx.insert(analyticsEvents).values({
      name,
      sessionId: sessionId.slice(0, 100),
      orderId: opts.orderId ?? null,
      props: opts.props ?? null,
    });
  }

  async findOrderIdByCode(code?: string) {
    const c = code ? normalizeOrderCode(code) : null;
    if (!c) return undefined;
    const [row] = await this.db.select({ id: orders.id }).from(orders).where(eq(orders.code, c));
    return row?.id;
  }
}

class TrackEventDto {
  @IsIn(CLIENT_EVENTS) name: EventName;
  @IsString() @Length(8, 100) sessionId: string;
  @IsOptional() @IsString() @MaxLength(20) orderCode?: string;
  @IsOptional() @IsObject() props?: Record<string, unknown>;
}

@Controller('events')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Frontend journey events (fire-and-forget). sessionId = a random id the frontend keeps per visit. */
  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async track(@Body() body: TrackEventDto) {
    const orderId = await this.analytics.findOrderIdByCode(body.orderCode);
    const props = body.props && JSON.stringify(body.props).length <= 2000 ? body.props : undefined;
    await this.analytics.track(body.name, body.sessionId, { orderId, props });
  }
}
