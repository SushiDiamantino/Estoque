import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  integer,
  date,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const locationTypeEnum = pgEnum("location_type", [
  "ambiente",
  "refrigerado",
  "congelado",
  "cozinha",
  "delivery",
  "externo",
]);

export const movementTypeEnum = pgEnum("movement_type", [
  "entrada",
  "saida",
  "transferencia",
]);

export const movementStatusEnum = pgEnum("movement_status", [
  "rascunho",
  "confirmada",
  "estornada",
]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "critico",
  "atencao",
  "informativo",
]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon").default("tag"),
  color: text("color").default("#a1a1aa"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const storageLocations = pgTable("storage_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  type: locationTypeEnum("type").notNull().default("ambiente"),
  active: boolean("active").notNull().default(true),
  address: text("address"),
  responsible: text("responsible"),
  capacity: text("capacity"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    description: text("description"),
    categoryId: uuid("category_id").references(() => categories.id),
    unit: text("unit").notNull().default("un"),
    minStock: numeric("min_stock", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    maxStock: numeric("max_stock", { precision: 14, scale: 3 }).default("0"),
    lotControl: boolean("lot_control").notNull().default(false),
    expiryControl: boolean("expiry_control").notNull().default(false),
    perishable: boolean("perishable").notNull().default(false),
    active: boolean("active").notNull().default(true),
    costPrice: numeric("cost_price", { precision: 14, scale: 2 }).default("0"),
    salePrice: numeric("sale_price", { precision: 14, scale: 2 }).default("0"),
    supplier: text("supplier"),
    leadTimeDays: integer("lead_time_days").default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("items_sku_unique").on(t.sku)]
);

export const stockBalances = pgTable(
  "stock_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => storageLocations.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    reservedQuantity: numeric("reserved_quantity", {
      precision: 14,
      scale: 3,
    })
      .notNull()
      .default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("stock_balances_item_location_unique").on(t.itemId, t.locationId)]
);

export const loanDirectionEnum = pgEnum("loan_direction", ["pegamos", "emprestamos"]);
export const loanStatusEnum = pgEnum("loan_status", ["aberto", "parcial", "quitado", "cancelado"]);

/** Restaurantes parceiros com quem pegamos/emprestamos insumos. */
export const partners = pgTable(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    contact: text("contact"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("partners_name_unique").on(sql`lower(${t.name})`)]
);

/**
 * Empréstimo entre restaurantes.
 * direction = "pegamos": recebemos insumos (entram no saldo) e devemos devolver.
 * direction = "emprestamos": cedemos insumos (saem do saldo) e devemos cobrar.
 */
export const loans = pgTable(
  "loans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    direction: loanDirectionEnum("direction").notNull(),
    status: loanStatusEnum("status").notNull().default("aberto"),
    partnerId: uuid("partner_id").notNull().references(() => partners.id),
    locationId: uuid("location_id").notNull().references(() => storageLocations.id),
    responsible: text("responsible"),
    notes: text("notes"),
    loanDate: date("loan_date").notNull(),
    dueDate: date("due_date").notNull(),
    extensions: integer("extensions").notNull().default(0),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("loans_code_unique").on(t.code),
    index("loans_status_due_idx").on(t.status, t.dueDate),
    index("loans_partner_idx").on(t.partnerId),
  ]
);

export const loanItems = pgTable(
  "loan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loanId: uuid("loan_id").notNull().references(() => loans.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull().default("0"),
    lotCode: text("lot_code"),
  },
  (t) => [index("loan_items_loan_idx").on(t.loanId)]
);

export const purchaseStatusEnum = pgEnum("purchase_status", [
  "rascunho",
  "enviado",
  "parcial",
  "recebido",
  "cancelado",
]);

/** Pedido de compra: nasce da sugestão da Central de Demanda ou manual. */
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    status: purchaseStatusEnum("status").notNull().default("rascunho"),
    kind: text("kind").notNull().default("programada"),
    supplier: text("supplier").notNull(),
    contact: text("contact"),
    locationId: uuid("location_id").notNull().references(() => storageLocations.id),
    responsible: text("responsible"),
    notes: text("notes"),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    totalValue: numeric("total_value", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("purchase_orders_code_unique").on(t.code),
    index("purchase_orders_status_idx").on(t.status, t.orderDate),
  ]
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull().default("0"),
    receivedQty: numeric("received_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    notes: text("notes"),
  },
  (t) => [index("purchase_order_items_order_idx").on(t.orderId)]
);

export const movements = pgTable("movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  type: movementTypeEnum("type").notNull(),
  status: movementStatusEnum("status").notNull().default("rascunho"),
  supplier: text("supplier"),
  invoiceNumber: text("invoice_number"),
  responsible: text("responsible"),
  reason: text("reason"),
  notes: text("notes"),
  sourceLocationId: uuid("source_location_id").references(
    () => storageLocations.id
  ),
  destLocationId: uuid("dest_location_id").references(
    () => storageLocations.id
  ),
  totalCost: numeric("total_cost", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  movementDate: timestamp("movement_date", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Preenchido quando gerada por empréstimo/devolução (bloqueia estorno manual). */
  loanId: uuid("loan_id").references(() => loans.id, { onDelete: "set null" }),
  /** Recebimento originado de um pedido de compra. */
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const movementItems = pgTable("movement_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  movementId: uuid("movement_id")
    .notNull()
    .references(() => movements.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "restrict" }),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).default("0"),
  lotCode: text("lot_code"),
  expiryDate: date("expiry_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Devolução física ("devolucao") ou acerto sem retorno físico ("baixa"). */
export const loanReturns = pgTable(
  "loan_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loanId: uuid("loan_id").notNull().references(() => loans.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("devolucao"),
    movementId: uuid("movement_id").references(() => movements.id, { onDelete: "set null" }),
    returnDate: date("return_date").notNull(),
    responsible: text("responsible"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("loan_returns_loan_idx").on(t.loanId)]
);

export const loanReturnItems = pgTable(
  "loan_return_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id").notNull().references(() => loanReturns.id, { onDelete: "cascade" }),
    loanItemId: uuid("loan_item_id").notNull().references(() => loanItems.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (t) => [index("loan_return_items_item_idx").on(t.loanItemId)]
);

/** Trilha de auditoria do empréstimo. */
export const loanEvents = pgTable(
  "loan_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loanId: uuid("loan_id").notNull().references(() => loans.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("loan_events_loan_idx").on(t.loanId)]
);

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  severity: alertSeverityEnum("severity").notNull().default("informativo"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
  locationId: uuid("location_id").references(() => storageLocations.id, {
    onDelete: "set null",
  }),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inventoryCounts = pgTable("inventory_counts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  locationId: uuid("location_id").references(() => storageLocations.id),
  status: text("status").notNull().default("aberto"),
  responsible: text("responsible"),
  notes: text("notes"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inventoryCountItems = pgTable(
  "inventory_count_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countId: uuid("count_id")
      .notNull()
      .references(() => inventoryCounts.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => storageLocations.id, { onDelete: "cascade" }),
    expectedQty: numeric("expected_qty", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    countedQty: numeric("counted_qty", { precision: 14, scale: 3 }),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("inventory_count_items_unique").on(t.countId, t.itemId, t.locationId),
  ]
);

export const userRoleEnum = pgEnum("user_role", ["admin", "gerente", "operador"]);

/** Usuários do sistema. Só Administrador cria, edita e inativa contas. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("operador"),
    active: boolean("active").notNull().default(true),
    /** troca de senha obrigatória no primeiro acesso */
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    /** apelido/local de trabalho exibido no menu lateral */
    workArea: text("work_area"),
    shift: text("shift"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastAccessAt: timestamp("last_access_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_username_unique").on(sql`lower(${t.username})`),
    index("users_role_idx").on(t.role),
  ]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
    action: text("action").notNull(),
    target: text("target"),
    details: text("details"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)]
);

/** Sessões persistentes (7 dias) — token em cookie httpOnly. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_unique").on(t.token), index("sessions_user_idx").on(t.userId)]
);

/** Configurações globais — linha única (id = 1). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  restaurantName: text("restaurant_name").notNull().default("Sushi Diamantino"),
  document: text("document"),
  address: text("address"),
  shift: text("shift").notNull().default("Turno tarde"),
  lowStockNotify: boolean("low_stock_notify").notNull().default(true),
  expiryNotify: boolean("expiry_notify").notNull().default(true),
  dailyDigest: boolean("daily_digest").notNull().default(false),
  expiryDays: integer("expiry_days").notNull().default(7),
  loanNotify: boolean("loan_notify").notNull().default(true),
  loanDueDays: integer("loan_due_days").notNull().default(3),
  demandNotify: boolean("demand_notify").notNull().default(true),
  demandHorizonDays: integer("demand_horizon_days").notNull().default(45),
  demandAlertDays: integer("demand_alert_days").notNull().default(14),
  advanceDay: integer("advance_day").notNull().default(20),
  /** Dias da semana de compra programada: "2,5" = terça e sexta (0=Dom). Vazio = inferir do histórico. */
  purchaseDays: text("purchase_days").notNull().default(""),
  /** Espalha consumo lançado em bloco pelos dias do período (casa abre todo dia). */
  spreadConsumption: boolean("spread_consumption").notNull().default(true),
  /** Usa divergências de inventário para corrigir o consumo real. */
  inventoryAnchor: boolean("inventory_anchor").notNull().default(true),
  priceNotify: boolean("price_notify").notNull().default(true),
  priceThreshold: integer("price_threshold").notNull().default(10),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Eventos personalizados do calendário de demanda + ajustes de eventos do sistema.
 * - Evento próprio: systemKey = null, com data única (date) ou recorrente (month/day).
 * - Ajuste de evento do sistema: systemKey preenchida (ex.: "namorados"); permite
 *   desligar (active=false) ou trocar o multiplicador esperado.
 */
export const demandEvents = pgTable(
  "demand_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("custom"),
    systemKey: text("system_key"),
    date: date("date"),
    month: integer("month"),
    day: integer("day"),
    multiplier: numeric("multiplier", { precision: 6, scale: 3 }).notNull().default("1.300"),
    windowBefore: integer("window_before").notNull().default(0),
    windowAfter: integer("window_after").notNull().default(0),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("demand_events_system_key_unique").on(t.systemKey)]
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type StorageLocation = typeof storageLocations.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Movement = typeof movements.$inferSelect;
export type MovementItem = typeof movementItems.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type Partner = typeof partners.$inferSelect;
export type Loan = typeof loans.$inferSelect;
export type LoanItem = typeof loanItems.$inferSelect;
export type DemandEvent = typeof demandEvents.$inferSelect;
export type User = typeof users.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
