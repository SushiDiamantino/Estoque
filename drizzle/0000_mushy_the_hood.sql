CREATE TYPE "public"."alert_severity" AS ENUM('critico', 'atencao', 'informativo');--> statement-breakpoint
CREATE TYPE "public"."loan_direction" AS ENUM('pegamos', 'emprestamos');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('aberto', 'parcial', 'quitado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('ambiente', 'refrigerado', 'congelado', 'cozinha', 'delivery', 'externo');--> statement-breakpoint
CREATE TYPE "public"."movement_status" AS ENUM('rascunho', 'confirmada', 'estornada');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('entrada', 'saida', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('rascunho', 'enviado', 'parcial', 'recebido', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'gerente', 'operador');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"severity" "alert_severity" DEFAULT 'informativo' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"item_id" uuid,
	"location_id" uuid,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_name" text,
	"action" text NOT NULL,
	"target" text,
	"details" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'tag',
	"color" text DEFAULT '#a1a1aa',
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"system_key" text,
	"date" date,
	"month" integer,
	"day" integer,
	"multiplier" numeric(6, 3) DEFAULT '1.300' NOT NULL,
	"window_before" integer DEFAULT 0 NOT NULL,
	"window_after" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_count_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"expected_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"counted_qty" numeric(14, 3),
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"location_id" uuid,
	"status" text DEFAULT 'aberto' NOT NULL,
	"responsible" text,
	"notes" text,
	"scheduled_for" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"description" text,
	"category_id" uuid,
	"unit" text DEFAULT 'un' NOT NULL,
	"min_stock" numeric(14, 3) DEFAULT '0' NOT NULL,
	"max_stock" numeric(14, 3) DEFAULT '0',
	"lot_control" boolean DEFAULT false NOT NULL,
	"expiry_control" boolean DEFAULT false NOT NULL,
	"perishable" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"cost_price" numeric(14, 2) DEFAULT '0',
	"sale_price" numeric(14, 2) DEFAULT '0',
	"supplier" text,
	"lead_time_days" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"lot_code" text
);
--> statement-breakpoint
CREATE TABLE "loan_return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"loan_item_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"kind" text DEFAULT 'devolucao' NOT NULL,
	"movement_id" uuid,
	"return_date" date NOT NULL,
	"responsible" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"direction" "loan_direction" NOT NULL,
	"status" "loan_status" DEFAULT 'aberto' NOT NULL,
	"partner_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"responsible" text,
	"notes" text,
	"loan_date" date NOT NULL,
	"due_date" date NOT NULL,
	"extensions" integer DEFAULT 0 NOT NULL,
	"settled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movement_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 2) DEFAULT '0',
	"lot_code" text,
	"expiry_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" "movement_type" NOT NULL,
	"status" "movement_status" DEFAULT 'rascunho' NOT NULL,
	"supplier" text,
	"invoice_number" text,
	"responsible" text,
	"reason" text,
	"notes" text,
	"source_location_id" uuid,
	"dest_location_id" uuid,
	"total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"movement_date" timestamp with time zone DEFAULT now() NOT NULL,
	"loan_id" uuid,
	"purchase_order_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"phone" text,
	"email" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"received_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" "purchase_status" DEFAULT 'rascunho' NOT NULL,
	"kind" text DEFAULT 'programada' NOT NULL,
	"supplier" text NOT NULL,
	"contact" text,
	"location_id" uuid NOT NULL,
	"responsible" text,
	"notes" text,
	"order_date" date NOT NULL,
	"expected_date" date,
	"sent_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"cancel_reason" text,
	"total_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"restaurant_name" text DEFAULT 'Sushi Diamantino' NOT NULL,
	"document" text,
	"address" text,
	"shift" text DEFAULT 'Turno tarde' NOT NULL,
	"low_stock_notify" boolean DEFAULT true NOT NULL,
	"expiry_notify" boolean DEFAULT true NOT NULL,
	"daily_digest" boolean DEFAULT false NOT NULL,
	"expiry_days" integer DEFAULT 7 NOT NULL,
	"loan_notify" boolean DEFAULT true NOT NULL,
	"loan_due_days" integer DEFAULT 3 NOT NULL,
	"demand_notify" boolean DEFAULT true NOT NULL,
	"demand_horizon_days" integer DEFAULT 45 NOT NULL,
	"demand_alert_days" integer DEFAULT 14 NOT NULL,
	"advance_day" integer DEFAULT 20 NOT NULL,
	"purchase_days" text DEFAULT '' NOT NULL,
	"spread_consumption" boolean DEFAULT true NOT NULL,
	"inventory_anchor" boolean DEFAULT true NOT NULL,
	"price_notify" boolean DEFAULT true NOT NULL,
	"price_threshold" integer DEFAULT 10 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reserved_quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "location_type" DEFAULT 'ambiente' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"address" text,
	"responsible" text,
	"capacity" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'operador' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"work_area" text,
	"shift" text,
	"phone" text,
	"email" text,
	"notes" text,
	"last_login_at" timestamp with time zone,
	"last_access_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_location_id_storage_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."storage_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_count_id_inventory_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."inventory_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_location_id_storage_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."storage_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_location_id_storage_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."storage_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_events" ADD CONSTRAINT "loan_events_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_items" ADD CONSTRAINT "loan_items_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_items" ADD CONSTRAINT "loan_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_return_items" ADD CONSTRAINT "loan_return_items_return_id_loan_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."loan_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_return_items" ADD CONSTRAINT "loan_return_items_loan_item_id_loan_items_id_fk" FOREIGN KEY ("loan_item_id") REFERENCES "public"."loan_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_returns" ADD CONSTRAINT "loan_returns_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_returns" ADD CONSTRAINT "loan_returns_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_location_id_storage_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."storage_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_items" ADD CONSTRAINT "movement_items_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_items" ADD CONSTRAINT "movement_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_source_location_id_storage_locations_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."storage_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_dest_location_id_storage_locations_id_fk" FOREIGN KEY ("dest_location_id") REFERENCES "public"."storage_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_location_id_storage_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."storage_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_location_id_storage_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."storage_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "demand_events_system_key_unique" ON "demand_events" USING btree ("system_key");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_count_items_unique" ON "inventory_count_items" USING btree ("count_id","item_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_sku_unique" ON "items" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "loan_events_loan_idx" ON "loan_events" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loan_items_loan_idx" ON "loan_items" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loan_return_items_item_idx" ON "loan_return_items" USING btree ("loan_item_id");--> statement-breakpoint
CREATE INDEX "loan_returns_loan_idx" ON "loan_returns" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loans_code_unique" ON "loans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "loans_status_due_idx" ON "loans" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "loans_partner_idx" ON "loans" USING btree ("partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partners_name_unique" ON "partners" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "purchase_order_items_order_idx" ON "purchase_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_code_unique" ON "purchase_orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status","order_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_balances_item_location_unique" ON "stock_balances" USING btree ("item_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");