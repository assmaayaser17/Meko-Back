// MEKO Accessoriez — customer-facing backend data model (Drizzle ORM, PostgreSQL).
// Money is stored as INTEGER PIASTERS (1 EGP = 100) to avoid floating point errors.
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------- enums

export const orderType = pgEnum('order_type', ['FOR_ME', 'GIFT']);

export const ORDER_STATUSES = [
  'PENDING_PAYMENT', // created, deposit not paid yet
  'DEPOSIT_PAID', // deposit (or full amount) paid, waiting for the designer
  'DESIGNING', // designer working (first design or after an edit request)
  'DESIGN_READY', // a design version is waiting for the customer's review
  'APPROVED', // customer approved the design
  'IN_PRODUCTION', // being made and packed
  'SHIPPED',
  'DELIVERED',
  'CANCELLED', // never paid the deposit
  'CLOSED_NOT_APPROVED', // customer did not approve; nothing produced, remaining not charged
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatus = pgEnum('order_status', ORDER_STATUSES);

export const paymentKind = pgEnum('payment_kind', ['DEPOSIT', 'FULL', 'REMAINING']);
export const paymentStatus = pgEnum('payment_status', ['PENDING', 'PAID', 'FAILED']);
export const uploadKind = pgEnum('upload_kind', [
  'INSPIRATION', // customer inspiration photo
  'HANDWRITING', // handwriting to engrave (gifts)
  'DESIGN_PIECE', // designer: the piece
  'DESIGN_PACKAGE', // designer: the piece inside the packaging
]);
export const optionKind = pgEnum('option_kind', ['COLOR', 'LENGTH']);
export const chipCategory = pgEnum('chip_category', ['HOBBY', 'SPORT', 'ZODIAC']);
export const giftRelationship = pgEnum('gift_relationship', ['MOTHER', 'PARTNER', 'SISTER', 'FRIEND', 'OTHER']);
export const remainingPaymentMode = pgEnum('remaining_payment_mode', ['ONLINE_AFTER_APPROVAL', 'CASH_ON_DELIVERY']);
export const staffRole = pgEnum('staff_role', ['ADMIN', 'DESIGNER', 'SUPPORT']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------- catalog & content (managed from the admin later)

export const pieceTypes = pgTable('piece_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  imageUrl: text('image_url'),
  basePrice: integer('base_price').notNull(), // piasters
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const styles = pgTable(
  'styles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pieceTypeId: uuid('piece_type_id')
      .notNull()
      .references(() => pieceTypes.id),
    slug: text('slug').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    imageUrl: text('image_url'),
    priceDelta: integer('price_delta').notNull().default(0), // piasters
    isStoryDesign: boolean('is_story_design').notNull().default(false), // "تصميم من قصتك" -> story required
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('styles_piece_slug_uq').on(t.pieceTypeId, t.slug)],
);

export const options = pgTable('options', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: optionKind('kind').notNull(),
  valueAr: text('value_ar').notNull(),
  valueEn: text('value_en').notNull(),
  priceDelta: integer('price_delta').notNull().default(0), // piasters
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

/** Which options (colors, lengths) apply to which piece types. */
export const pieceTypeOptions = pgTable(
  'piece_type_options',
  {
    pieceTypeId: uuid('piece_type_id')
      .notNull()
      .references(() => pieceTypes.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => options.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('piece_type_options_uq').on(t.pieceTypeId, t.optionId)],
);

export const symbols = pgTable('symbols', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nameAr: text('name_ar').notNull(),
  icon: text('icon'), // icon key or URL for the frontend
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const promptChips = pgTable('prompt_chips', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: chipCategory('category').notNull(),
  labelAr: text('label_ar').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const guidingQuestions = pgTable('guiding_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  textAr: text('text_ar').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const shippingZones = pgTable('shipping_zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  governorate: text('governorate').notNull().unique(),
  fee: integer('fee').notNull(), // piasters
  deliveryDaysMin: integer('delivery_days_min'),
  deliveryDaysMax: integer('delivery_days_max'),
  isActive: boolean('is_active').notNull().default(true),
});

export const stories = pgTable('stories', {
  id: uuid('id').primaryKey().defaultRandom(),
  quoteAr: text('quote_ar').notNull(),
  symbolsAr: text('symbols_ar').array().notNull().default(sql`'{}'::text[]`),
  imageUrl: text('image_url'),
  customerConsent: boolean('customer_consent').notNull().default(false), // never published without it
  isPublished: boolean('is_published').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

export const faqs = pgTable('faqs', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionAr: text('question_ar').notNull(),
  answerAr: text('answer_ar').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

/** Single row (id = 1) holding business rules editable from the admin. */
export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  depositPercent: integer('deposit_percent').notNull().default(50),
  maxEdits: integer('max_edits').notNull().default(3),
  upsellDiscountPercent: integer('upsell_discount_percent').notNull().default(35),
  whatsappNumber: text('whatsapp_number').notNull().default(''), // international digits, e.g. 2010xxxxxxxx
  unpaidOrderTtlHours: integer('unpaid_order_ttl_hours').notNull().default(48),
  remainingPaymentMode: remainingPaymentMode('remaining_payment_mode').notNull().default('ONLINE_AFTER_APPROVAL'),
  currency: text('currency').notNull().default('EGP'),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- staff (used by the admin later)

export const staffUsers = pgTable('staff_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: staffRole('role').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- orders

export type GuidingAnswer = { questionId: string; question: string; answer: string };
export type SymbolExplanation = { symbol: string; reason: string };
export type OrderSelections = {
  pieceType: { id: string; nameAr: string; nameEn: string };
  style: { id: string; nameAr: string; nameEn: string; isStoryDesign: boolean };
  color: { id: string; valueAr: string; valueEn: string } | null;
  length: { id: string; valueAr: string; valueEn: string } | null;
  symbols: { id: string; nameAr: string }[];
  chips: { id: string; category: string; labelAr: string }[];
};

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(), // e.g. MK-7Q4X29, random, not sequential
    type: orderType('type').notNull(),
    status: orderStatus('status').notNull().default('PENDING_PAYMENT'),

    customerName: text('customer_name').notNull(),
    phone: text('phone').notNull(), // normalized: +201XXXXXXXXX
    email: text('email'),
    governorate: text('governorate').notNull(),
    city: text('city'),
    address: text('address').notNull(),

    pieceTypeId: uuid('piece_type_id')
      .notNull()
      .references(() => pieceTypes.id),
    styleId: uuid('style_id')
      .notNull()
      .references(() => styles.id),
    colorOptionId: uuid('color_option_id').references(() => options.id),
    lengthOptionId: uuid('length_option_id').references(() => options.id),
    engravingName: text('engraving_name'),

    story: text('story'),
    symbolIds: uuid('symbol_ids').array().notNull().default(sql`'{}'::uuid[]`),
    chipIds: uuid('chip_ids').array().notNull().default(sql`'{}'::uuid[]`),
    guidingAnswers: jsonb('guiding_answers').$type<GuidingAnswer[]>(),
    /** Human-readable snapshot of the choices, so later catalog edits never change old orders. */
    selections: jsonb('selections').$type<OrderSelections>().notNull(),

    giftRelationship: giftRelationship('gift_relationship'),
    giftRecipientName: text('gift_recipient_name'),
    giftMessage: text('gift_message'),

    // price snapshot (piasters)
    itemPrice: integer('item_price').notNull(),
    shippingFee: integer('shipping_fee').notNull(),
    total: integer('total').notNull(),
    depositAmount: integer('deposit_amount').notNull(),
    remainingAmount: integer('remaining_amount').notNull(),
    depositPercent: integer('deposit_percent').notNull(),
    maxEdits: integer('max_edits').notNull(),
    editsUsed: integer('edits_used').notNull().default(0),

    policyAcceptedAt: timestamp('policy_accepted_at', { withTimezone: true }).notNull(),
    needsClarification: boolean('needs_clarification').notNull().default(false),
    approvedVersionId: uuid('approved_version_id'),
    assignedDesignerId: uuid('assigned_designer_id').references(() => staffUsers.id),
    utm: jsonb('utm').$type<Record<string, string>>(),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('orders_status_created_idx').on(t.status, t.createdAt), index('orders_phone_idx').on(t.phone)],
);

export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
  kind: uploadKind('kind').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  originalName: text('original_name'),
  createdAt: createdAt(),
});

export const designVersions = pgTable(
  'design_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    versionNo: integer('version_no').notNull(),
    pieceImageId: uuid('piece_image_id')
      .notNull()
      .references(() => uploads.id),
    packageImageId: uuid('package_image_id')
      .notNull()
      .references(() => uploads.id),
    /** "How your story became a piece": [{symbol, reason}] */
    symbolsExplanation: jsonb('symbols_explanation').$type<SymbolExplanation[]>().notNull(),
    designerNote: text('designer_note'),
    createdById: uuid('created_by_id').references(() => staffUsers.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('design_versions_order_version_uq').on(t.orderId, t.versionNo)],
);

export const editRequests = pgTable('edit_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  designVersionId: uuid('design_version_id')
    .notNull()
    .references(() => designVersions.id),
  categories: text('categories').array().notNull(),
  text: text('text').notNull(),
  createdAt: createdAt(),
});

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    kind: paymentKind('kind').notNull(),
    amount: integer('amount').notNull(), // piasters
    provider: text('provider').notNull(),
    providerRef: text('provider_ref').unique(),
    status: paymentStatus('status').notNull().default('PENDING'),
    rawPayload: jsonb('raw_payload'),
    createdAt: createdAt(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (t) => [index('payments_order_status_idx').on(t.orderId, t.status)],
);

export const statusHistory = pgTable(
  'status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatus('from_status'),
    toStatus: orderStatus('to_status').notNull(),
    actor: text('actor').notNull(), // "system" | "customer" | "staff:<id>" | "payment:<provider>"
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('status_history_order_idx').on(t.orderId, t.createdAt)],
);

// ---------------------------------------------------------------- analytics

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: text('session_id').notNull(),
    name: text('name').notNull(),
    orderId: uuid('order_id'),
    props: jsonb('props'),
    createdAt: createdAt(),
  },
  (t) => [index('analytics_name_created_idx').on(t.name, t.createdAt), index('analytics_session_idx').on(t.sessionId)],
);

// ---------------------------------------------------------------- relations (for db.query.*)

export const pieceTypesRelations = relations(pieceTypes, ({ many }) => ({
  styles: many(styles),
  pieceTypeOptions: many(pieceTypeOptions),
}));
export const stylesRelations = relations(styles, ({ one }) => ({
  pieceType: one(pieceTypes, { fields: [styles.pieceTypeId], references: [pieceTypes.id] }),
}));
export const pieceTypeOptionsRelations = relations(pieceTypeOptions, ({ one }) => ({
  pieceType: one(pieceTypes, { fields: [pieceTypeOptions.pieceTypeId], references: [pieceTypes.id] }),
  option: one(options, { fields: [pieceTypeOptions.optionId], references: [options.id] }),
}));
export const ordersRelations = relations(orders, ({ many }) => ({
  uploads: many(uploads),
  designs: many(designVersions),
  editRequests: many(editRequests),
  payments: many(payments),
  history: many(statusHistory),
}));
export const uploadsRelations = relations(uploads, ({ one }) => ({
  order: one(orders, { fields: [uploads.orderId], references: [orders.id] }),
}));
export const designVersionsRelations = relations(designVersions, ({ one, many }) => ({
  order: one(orders, { fields: [designVersions.orderId], references: [orders.id] }),
  pieceImage: one(uploads, { fields: [designVersions.pieceImageId], references: [uploads.id] }),
  packageImage: one(uploads, { fields: [designVersions.packageImageId], references: [uploads.id] }),
  editRequests: many(editRequests),
}));
export const editRequestsRelations = relations(editRequests, ({ one }) => ({
  order: one(orders, { fields: [editRequests.orderId], references: [orders.id] }),
  designVersion: one(designVersions, { fields: [editRequests.designVersionId], references: [designVersions.id] }),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));
export const statusHistoryRelations = relations(statusHistory, ({ one }) => ({
  order: one(orders, { fields: [statusHistory.orderId], references: [orders.id] }),
}));

export type Order = typeof orders.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Setting = typeof settings.$inferSelect;
