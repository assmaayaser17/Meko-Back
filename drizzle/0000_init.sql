CREATE TYPE "public"."chip_category" AS ENUM('HOBBY', 'SPORT', 'ZODIAC');--> statement-breakpoint
CREATE TYPE "public"."gift_relationship" AS ENUM('MOTHER', 'PARTNER', 'SISTER', 'FRIEND', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."option_kind" AS ENUM('COLOR', 'LENGTH');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING_PAYMENT', 'DEPOSIT_PAID', 'DESIGNING', 'DESIGN_READY', 'APPROVED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'CLOSED_NOT_APPROVED');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('FOR_ME', 'GIFT');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('DEPOSIT', 'FULL', 'REMAINING');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'PAID', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."remaining_payment_mode" AS ENUM('ONLINE_AFTER_APPROVAL', 'CASH_ON_DELIVERY');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('ADMIN', 'DESIGNER', 'SUPPORT');--> statement-breakpoint
CREATE TYPE "public"."upload_kind" AS ENUM('INSPIRATION', 'HANDWRITING', 'DESIGN_PIECE', 'DESIGN_PACKAGE');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"name" text NOT NULL,
	"order_id" uuid,
	"props" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"piece_image_id" uuid NOT NULL,
	"package_image_id" uuid NOT NULL,
	"symbols_explanation" jsonb NOT NULL,
	"designer_note" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"design_version_id" uuid NOT NULL,
	"categories" text[] NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_ar" text NOT NULL,
	"answer_ar" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guiding_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text_ar" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "option_kind" NOT NULL,
	"value_ar" text NOT NULL,
	"value_en" text NOT NULL,
	"price_delta" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" "order_type" NOT NULL,
	"status" "order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"governorate" text NOT NULL,
	"city" text,
	"address" text NOT NULL,
	"piece_type_id" uuid NOT NULL,
	"style_id" uuid NOT NULL,
	"color_option_id" uuid,
	"length_option_id" uuid,
	"engraving_name" text,
	"story" text,
	"symbol_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"chip_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"guiding_answers" jsonb,
	"selections" jsonb NOT NULL,
	"gift_relationship" "gift_relationship",
	"gift_recipient_name" text,
	"gift_message" text,
	"item_price" integer NOT NULL,
	"shipping_fee" integer NOT NULL,
	"total" integer NOT NULL,
	"deposit_amount" integer NOT NULL,
	"remaining_amount" integer NOT NULL,
	"deposit_percent" integer NOT NULL,
	"max_edits" integer NOT NULL,
	"edits_used" integer DEFAULT 0 NOT NULL,
	"policy_accepted_at" timestamp with time zone NOT NULL,
	"needs_clarification" boolean DEFAULT false NOT NULL,
	"approved_version_id" uuid,
	"assigned_designer_id" uuid,
	"utm" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"amount" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "payments_provider_ref_unique" UNIQUE("provider_ref")
);
--> statement-breakpoint
CREATE TABLE "piece_type_options" (
	"piece_type_id" uuid NOT NULL,
	"option_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "piece_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"image_url" text,
	"base_price" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "piece_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "prompt_chips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "chip_category" NOT NULL,
	"label_ar" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"deposit_percent" integer DEFAULT 50 NOT NULL,
	"max_edits" integer DEFAULT 3 NOT NULL,
	"upsell_discount_percent" integer DEFAULT 35 NOT NULL,
	"whatsapp_number" text DEFAULT '' NOT NULL,
	"unpaid_order_ttl_hours" integer DEFAULT 48 NOT NULL,
	"remaining_payment_mode" "remaining_payment_mode" DEFAULT 'ONLINE_AFTER_APPROVAL' NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"governorate" text NOT NULL,
	"fee" integer NOT NULL,
	"delivery_days_min" integer,
	"delivery_days_max" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "shipping_zones_governorate_unique" UNIQUE("governorate")
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_ar" text NOT NULL,
	"symbols_ar" text[] DEFAULT '{}'::text[] NOT NULL,
	"image_url" text,
	"customer_consent" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "styles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"piece_type_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"image_url" text,
	"price_delta" integer DEFAULT 0 NOT NULL,
	"is_story_design" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"icon" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "symbols_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"kind" "upload_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"original_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_piece_image_id_uploads_id_fk" FOREIGN KEY ("piece_image_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_package_image_id_uploads_id_fk" FOREIGN KEY ("package_image_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_design_version_id_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_piece_type_id_piece_types_id_fk" FOREIGN KEY ("piece_type_id") REFERENCES "public"."piece_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_style_id_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."styles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_color_option_id_options_id_fk" FOREIGN KEY ("color_option_id") REFERENCES "public"."options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_length_option_id_options_id_fk" FOREIGN KEY ("length_option_id") REFERENCES "public"."options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_designer_id_staff_users_id_fk" FOREIGN KEY ("assigned_designer_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_type_options" ADD CONSTRAINT "piece_type_options_piece_type_id_piece_types_id_fk" FOREIGN KEY ("piece_type_id") REFERENCES "public"."piece_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_type_options" ADD CONSTRAINT "piece_type_options_option_id_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "styles" ADD CONSTRAINT "styles_piece_type_id_piece_types_id_fk" FOREIGN KEY ("piece_type_id") REFERENCES "public"."piece_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_name_created_idx" ON "analytics_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "analytics_session_idx" ON "analytics_events" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "design_versions_order_version_uq" ON "design_versions" USING btree ("order_id","version_no");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_phone_idx" ON "orders" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "payments_order_status_idx" ON "payments" USING btree ("order_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "piece_type_options_uq" ON "piece_type_options" USING btree ("piece_type_id","option_id");--> statement-breakpoint
CREATE INDEX "status_history_order_idx" ON "status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "styles_piece_slug_uq" ON "styles" USING btree ("piece_type_id","slug");