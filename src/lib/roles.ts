/**
 * Papéis e permissões — módulo puro (sem banco), usado no servidor e no cliente.
 */
export type Role = "admin" | "gerente" | "operador";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  operador: "Operador",
};

export const ROLE_DESC: Record<Role, string> = {
  admin: "Acesso total: usuários, configurações e todos os módulos.",
  gerente: "Confirma e estorna movimentações, fecha inventários e gerencia compras.",
  operador: "Registra entradas, saídas, transferências e inventários.",
};

export const PERMISSIONS: Record<Role, string[]> = {
  admin: ["*"],
  gerente: [
    "dashboard", "itens", "categorias", "locais", "entradas", "saidas", "transferencias",
    "emprestimos", "compras", "inventario", "alertas", "relatorios", "demanda", "configuracoes",
    "movement.confirm", "movement.reverse", "purchase.receive", "purchase.send", "inventory.conclude",
    "item.create", "item.edit",
  ],
  operador: [
    "dashboard", "itens", "entradas", "saidas", "transferencias", "alertas", "demanda",
    "movement.confirm", "inventory.count",
  ],
};

export type Permission =
  | "dashboard" | "itens" | "categorias" | "locais" | "entradas" | "saidas" | "transferencias"
  | "emprestimos" | "compras" | "inventario" | "alertas" | "relatorios" | "demanda" | "configuracoes"
  | "usuarios" | "movement.confirm" | "movement.reverse" | "purchase.receive" | "purchase.send"
  | "inventory.conclude" | "inventory.count" | "item.create" | "item.edit";

export function can(role: Role, perm: string): boolean {
  const list = PERMISSIONS[role];
  return list.includes("*") || list.includes(perm);
}

/** Rotas que cada perfil enxerga no menu. */
export const ROUTE_PERMISSION: Record<string, string> = {
  "/": "dashboard",
  "/itens": "itens",
  "/categorias": "categorias",
  "/locais": "locais",
  "/entradas": "entradas",
  "/saidas": "saidas",
  "/transferencias": "transferencias",
  "/emprestimos": "emprestimos",
  "/compras": "compras",
  "/inventario": "inventario",
  "/alertas": "alertas",
  "/relatorios": "relatorios",
  "/demanda": "demanda",
  "/configuracoes": "configuracoes",
  "/usuarios": "usuarios",
};
