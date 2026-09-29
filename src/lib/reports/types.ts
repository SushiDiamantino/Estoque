export type Bucket = "day" | "week" | "month";
export type Granularity = "auto" | Bucket;
export type Cls =
  | "compra"
  | "consumo"
  | "perda"
  | "ajuste_in"
  | "ajuste_out"
  | "transferencia"
  | "emprestimo_in"
  | "emprestimo_out";

export type ReportFiltersInput = {
  from: string;
  to: string;
  locationId: string | null;
  categoryId: string | null;
  granularity: Granularity;
  /** dias de cobertura desejados para a sugestão de compra */
  targetDays: number;
  /** horizonte da projeção em dias */
  horizon: number;
};

export type Kpis = {
  purchases: number;
  purchasesQty: number;
  purchasesCount: number;
  avgTicket: number;
  consumption: number;
  losses: number;
  lossRate: number;
  adjustIn: number;
  adjustOut: number;
  adjustNet: number;
  entradasCount: number;
  saidasCount: number;
  transfersCount: number;
  movementsCount: number;
  itemsConsumed: number;
  avgDailyConsumption: number;
};

export type ItemStatus = "ruptura" | "critico" | "atencao" | "parado" | "sem_giro" | "ok";

export type ItemMetric = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  category: string | null;
  categoryColor: string | null;
  stock: number;
  stockValue: number;
  min: number;
  cost: number;
  leadTime: number;
  inQty: number;
  outQty: number;
  lossQty: number;
  outValue: number;
  prevOutQty: number;
  avgDaily: number;
  coverageDays: number | null;
  ruptureDate: string | null;
  daysToMin: number | null;
  suggestion: number;
  suggestionValue: number;
  status: ItemStatus;
  lastMove: string | null;
  lastOut: string | null;
  price: { first: number; last: number; min: number; max: number; avg: number; variation: number | null; buys: number } | null;
};

export type Insight = { tone: "good" | "warn" | "bad" | "info"; title: string; text: string };

export type ReportData = {
  generatedAt: string;
  restaurantName: string;
  today: string;
  filters: ReportFiltersInput & {
    locationName: string | null;
    categoryName: string | null;
    days: number;
    prevFrom: string;
    prevTo: string;
    bucket: Bucket;
  };
  options: { locations: { id: string; name: string }[]; categories: { id: string; name: string }[] };
  kpis: Kpis;
  prev: Kpis;
  stock: {
    value: number;
    qty: number;
    items: number;
    withStock: number;
    belowMin: number;
    ruptures: number;
    stagnantValue: number;
    stagnantCount: number;
    turnover: number | null;
    turnoverAnnual: number | null;
    dio: number | null;
  };
  series: {
    key: string;
    label: string;
    purchases: number;
    consumption: number;
    losses: number;
    entradas: number;
    saidas: number;
    transferencias: number;
  }[];
  abc: { itemId: string; name: string; sku: string; unit: string; qty: number; value: number; share: number; cumShare: number; cls: "A" | "B" | "C" }[];
  items: ItemMetric[];
  categories: { id: string; name: string; color: string; purchases: number; consumption: number; losses: number; stockValue: number; items: number }[];
  locations: { id: string; name: string; type: string; stockValue: number; stockQty: number; skus: number; inValue: number; outValue: number }[];
  suppliers: { name: string; value: number; movements: number; items: number; avgTicket: number; lastDate: string; share: number }[];
  losses: {
    byReason: { reason: string; value: number; qty: number; count: number }[];
    topItems: { name: string; unit: string; qty: number; value: number; reason: string }[];
  };
  transfers: { from: string; to: string; count: number; qty: number; value: number }[];
  weekday: { dow: number; label: string; total: number; avg: number }[];
  heatmap: number[][];
  expiry: {
    buckets: { label: string; count: number; value: number; tone: "bad" | "warn" | "info" }[];
    lots: { item: string; unit: string; lot: string | null; expiry: string; days: number; qty: number; risk: number; value: number; location: string | null }[];
  };
  inventory: {
    counts: { code: string; location: string; finishedAt: string; lines: number; exact: number; accuracy: number | null; divergenceValue: number; netValue: number }[];
    accuracy: number | null;
    divergenceValue: number;
    netValue: number;
  };
  loans: {
    toReceive: number;
    toReturn: number;
    net: number;
    openCount: number;
    overdueCount: number;
    overdueValue: number;
    createdInPeriod: number;
    settledInPeriod: number;
    avgDaysToSettle: number | null;
    aging: { label: string; receive: number; ret: number }[];
    byPartner: { partner: string; receive: number; ret: number; overdue: number; open: number }[];
    open: { code: string; partner: string; direction: "pegamos" | "emprestamos"; due: string; daysLeft: number; value: number }[];
  };
  forecast: {
    method: "regressao" | "media" | "insuficiente";
    start: string;
    history: { date: string; value: number; ma7: number | null }[];
    points: { date: string; value: number; low: number; high: number }[];
    total: number;
    low: number;
    high: number;
    slopePerDay: number;
    trendPctMonth: number | null;
    r2: number | null;
    weekdayFactors: number[];
    projectedStockValue: number;
    purchaseNeed: number;
    rupturesInHorizon: number;
  };
  insights: Insight[];
  movementsLog: {
    code: string;
    type: string;
    cls: Cls;
    date: string;
    reason: string | null;
    supplier: string | null;
    from: string | null;
    to: string | null;
    items: number;
    qty: number;
    value: number;
  }[];
};

export const CLS_LABEL: Record<Cls, string> = {
  compra: "Compra",
  consumo: "Consumo",
  perda: "Perda",
  ajuste_in: "Ajuste (+)",
  ajuste_out: "Ajuste (−)",
  transferencia: "Transferência",
  emprestimo_in: "Empréstimo (entrada)",
  emprestimo_out: "Empréstimo (saída)",
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
  ruptura: "Ruptura",
  critico: "Abaixo do mínimo",
  atencao: "Cobertura baixa",
  parado: "Estoque parado",
  sem_giro: "Sem giro",
  ok: "Saudável",
};

export const SECTIONS = [
  { id: "overview", label: "Visão geral" },
  { id: "consumo", label: "Consumo & custos" },
  { id: "estoque", label: "Estoque & cobertura" },
  { id: "compras", label: "Compras & fornecedores" },
  { id: "perdas", label: "Perdas & validade" },
  { id: "movimentacao", label: "Movimentação" },
  { id: "inventario", label: "Inventário" },
  { id: "emprestimos", label: "Empréstimos" },
  { id: "projecoes", label: "Projeções & compras" },
  { id: "extrato", label: "Extrato de movimentações" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];
