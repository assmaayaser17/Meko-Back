import { Injectable } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import { AnalyticsService } from '../analytics/analytics';
import { Errors } from '../common/errors';
import { money } from '../common/money';
import { customerToBrandMessage, whatsappLink } from '../common/whatsapp';
import { Db, DbOrTx, InjectDb } from '../db/db.module';
import { designVersions, editRequests, Order, orders, statusHistory, uploads } from '../db/schema';
import { CUSTOMER_STATUS_LABELS, HAPPY_PATH, OrderStateService } from '../orders/order-state';
import { PaymentsService } from '../payments/payments.service';
import { SettingsService } from '../settings/settings.service';
import { UploadsService } from '../uploads/uploads.service';

export const EDIT_CATEGORIES = ['NAME', 'SYMBOLS', 'SIZE', 'PLACEMENT', 'DETAILS', 'OTHER'] as const;
export type EditCategory = (typeof EDIT_CATEGORIES)[number];

const TERMINAL = new Set(['CANCELLED', 'CLOSED_NOT_APPROVED', 'DELIVERED']);

@Injectable()
export class MyOrderService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly state: OrderStateService,
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
    private readonly uploadsService: UploadsService,
    private readonly analytics: AnalyticsService,
  ) {}

  private async load(orderId: string, tx: DbOrTx = this.db, lock = false) {
    const q = tx.select().from(orders).where(eq(orders.id, orderId));
    const [order] = lock ? await q.for('update') : await q;
    if (!order) throw Errors.unauthorized();
    return order;
  }

  private async latestDesign(orderId: string, tx: DbOrTx = this.db) {
    const [v] = await tx
      .select()
      .from(designVersions)
      .where(eq(designVersions.orderId, orderId))
      .orderBy(desc(designVersions.versionNo))
      .limit(1);
    return v ?? null;
  }

  /** WhatsApp opens up once the first design has been delivered ("from the first edit"), never before. */
  private async whatsapp(order: Order, hasDesign: boolean) {
    if (!hasDesign) return null;
    const s = await this.settings.get();
    return whatsappLink(s.whatsappNumber, customerToBrandMessage(order.code));
  }

  /** Order summary + tracking timeline + what the customer can do next. */
  async get(orderId: string) {
    const order = await this.load(orderId);
    const [history, design, pay, s] = await Promise.all([
      this.db.select().from(statusHistory).where(eq(statusHistory.orderId, orderId)).orderBy(asc(statusHistory.createdAt)),
      this.latestDesign(orderId),
      this.payments.summary(orderId),
      this.settings.get(),
    ]);

    const reached = new Set(history.map((h) => h.toStatus));
    const timeline = history.map((h) => ({
      status: h.toStatus,
      label: CUSTOMER_STATUS_LABELS[h.toStatus],
      at: h.createdAt,
      done: true,
    }));
    if (!TERMINAL.has(order.status)) {
      for (const st of HAPPY_PATH) {
        if (!reached.has(st)) timeline.push({ status: st, label: CUSTOMER_STATUS_LABELS[st], at: null as any, done: false });
      }
    }

    const remainingDue = pay.paidKinds.has('FULL') || pay.paidKinds.has('REMAINING') ? 0 : order.remainingAmount;
    return {
      code: order.code,
      type: order.type,
      status: order.status,
      statusLabel: CUSTOMER_STATUS_LABELS[order.status],
      customerName: order.customerName,
      selections: order.selections,
      engravingName: order.engravingName,
      story: order.story,
      gift:
        order.type === 'GIFT'
          ? { relationship: order.giftRelationship, recipientName: order.giftRecipientName, message: order.giftMessage }
          : null,
      pricing: {
        itemPrice: money(order.itemPrice),
        shippingFee: money(order.shippingFee),
        total: money(order.total),
        deposit: money(order.depositAmount),
        paid: money(pay.paid),
        remainingDue: money(order.status === 'CLOSED_NOT_APPROVED' ? 0 : remainingDue),
        remainingPaymentMode: s.remainingPaymentMode,
      },
      edits: { used: order.editsUsed, max: order.maxEdits, remaining: Math.max(0, order.maxEdits - order.editsUsed) },
      design: { available: Boolean(design), versionNo: design?.versionNo ?? null },
      timeline,
      nextAction: this.nextAction(order, Boolean(design), remainingDue, s.remainingPaymentMode),
      whatsappUrl: await this.whatsapp(order, Boolean(design)),
    };
  }

  private nextAction(order: Order, hasDesign: boolean, remainingDue: number, mode: string) {
    switch (order.status) {
      case 'PENDING_PAYMENT':
        return 'PAY_DEPOSIT';
      case 'DESIGN_READY':
        return 'REVIEW_DESIGN';
      case 'APPROVED':
      case 'IN_PRODUCTION':
      case 'SHIPPED':
        return remainingDue > 0 && mode === 'ONLINE_AFTER_APPROVAL' ? 'PAY_REMAINING' : 'WAIT';
      default:
        return hasDesign && order.status === 'DESIGNING' ? 'WAIT_FOR_NEW_VERSION' : 'WAIT';
    }
  }

  /** The latest design: the piece, the piece in its packaging, and "how your story became a piece". */
  async getDesign(orderId: string) {
    const order = await this.load(orderId);
    const design = await this.latestDesign(orderId);
    if (!design) throw Errors.conflict('DESIGN_NOT_READY', 'التصميم لسه بيتجهز، هنبعتلك على واتساب أول ما يخلص');

    const images = await this.db.select().from(uploads).where(eq(uploads.orderId, orderId));
    const byId = new Map(images.map((u) => [u.id, u]));
    const piece = byId.get(design.pieceImageId);
    const pkg = byId.get(design.packageImageId);

    await this.analytics.track('design_viewed', `order:${orderId}`, { orderId, props: { versionNo: design.versionNo } });

    const editsRemaining = Math.max(0, order.maxEdits - order.editsUsed);
    return {
      code: order.code,
      customerName: order.customerName,
      versionId: design.id,
      versionNo: design.versionNo,
      images: {
        piece: piece ? this.uploadsService.present(piece).url : null,
        package: pkg ? this.uploadsService.present(pkg).url : null,
      },
      storyToPiece: design.symbolsExplanation,
      designerNote: design.designerNote,
      status: order.status,
      isApproved: order.approvedVersionId === design.id,
      canApprove: order.status === 'DESIGN_READY',
      canRequestEdit: order.status === 'DESIGN_READY' && editsRemaining > 0,
      editsRemaining,
      whatsappUrl: await this.whatsapp(order, true),
    };
  }

  async approve(orderId: string, versionId: string) {
    await this.db.transaction(async (tx) => {
      const order = await this.load(orderId, tx, true);
      if (order.status !== 'DESIGN_READY') {
        throw Errors.conflict('NOT_REVIEWABLE', 'التصميم مش في مرحلة المراجعة دلوقتي');
      }
      const latest = await this.latestDesign(orderId, tx);
      if (!latest || latest.id !== versionId) {
        throw Errors.conflict('DESIGN_OUTDATED', 'في نسخة أحدث من التصميم، حدّثي الصفحة');
      }
      await tx.update(orders).set({ approvedVersionId: versionId }).where(eq(orders.id, orderId));
      await this.state.transition(tx, orderId, 'DESIGN_READY', 'APPROVED', 'customer', `version ${latest.versionNo}`);
      await this.analytics.track('design_approved', `order:${orderId}`, { orderId, props: { versionNo: latest.versionNo } }, tx);
    });
    return this.get(orderId);
  }

  async requestEdit(orderId: string, categories: EditCategory[], text: string) {
    const result = await this.db.transaction(async (tx) => {
      const order = await this.load(orderId, tx, true);
      if (order.status !== 'DESIGN_READY') {
        throw Errors.conflict('NOT_REVIEWABLE', 'التصميم مش في مرحلة المراجعة دلوقتي');
      }
      if (order.editsUsed >= order.maxEdits) {
        throw Errors.conflict('EDIT_LIMIT_REACHED', 'خلصتي التعديلات المتاحة، كلمينا على واتساب ونكمل معاكي', {
          whatsappUrl: await this.whatsapp(order, true),
        });
      }
      const latest = await this.latestDesign(orderId, tx);
      if (!latest) throw Errors.conflict('DESIGN_NOT_READY', 'مفيش تصميم للتعديل عليه');

      await tx.insert(editRequests).values({ orderId, designVersionId: latest.id, categories, text: text.trim() });
      await tx.update(orders).set({ editsUsed: order.editsUsed + 1 }).where(eq(orders.id, orderId));
      await this.state.transition(tx, orderId, 'DESIGN_READY', 'DESIGNING', 'customer', `edit ${order.editsUsed + 1}`);
      await this.analytics.track('edit_requested', `order:${orderId}`, { orderId, props: { editNo: order.editsUsed + 1, categories } }, tx);
      return { editNo: order.editsUsed + 1, max: order.maxEdits, order };
    });
    return {
      editNo: result.editNo,
      editsRemaining: Math.max(0, result.max - result.editNo),
      whatsappUrl: await this.whatsapp(result.order, true),
    };
  }

  async whatsappUrl(orderId: string) {
    const order = await this.load(orderId);
    const url = await this.whatsapp(order, Boolean(await this.latestDesign(orderId)));
    if (!url) throw Errors.conflict('WHATSAPP_NOT_AVAILABLE', 'التواصل على واتساب بيكون متاح بعد ما تستلمي التصميم');
    return { url };
  }
}
