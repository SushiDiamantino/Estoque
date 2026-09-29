"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  KeyRound,
  Power,
  ShieldCheck,
  Shield,
  UserCog,
  Clock3,
  Monitor,
  Loader2,
  FileDown,
} from "lucide-react";
import {
  StatCard,
  TableShell,
  Th,
  Td,
  Modal,
  Field,
  inputCls,
  PrimaryButton,
  PageBadge,
  LoadingRows,
  Toggle,
} from "@/components/ui";
import { PdfButton } from "@/components/PdfButton";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { pdfList } from "@/lib/pdf/docs";
import { api as apiGet } from "@/lib/api";

type Log = { id: string; userName: string | null; action: string; target: string | null; details: string | null; createdAt: string };
const ACTION_LABEL: Record<string, string> = {
  login: "Entrou no sistema",
  logout: "Saiu do sistema",
  "senha.alterada": "Alterou a própria senha",
  "senha.redefinida": "Redefiniu a senha de um usuário",
  "usuario.criado": "Criou um usuário",
  "usuario.editado": "Editou um usuário",
  "usuario.excluido": "Excluiu um usuário",
};
type User = {
  id: string;
  name: string;
  username: string;
  role: "admin" | "gerente" | "operador";
  roleLabel: string;
  active: boolean;
  mustChangePassword: boolean;
  workArea: string | null;
  shift: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  lastLoginAt: string | null;
  lastAccessAt: string | null;
  createdAt: string;
  activeSessions: number;
};

const ROLES: { value: User["role"]; label: string; desc: string }[] = [
  { value: "admin", label: "Administrador", desc: "Acesso total, incluindo usuários e configurações." },
  { value: "gerente", label: "Gerente", desc: "Confirma e estorna movimentações, fecha inventários, gerencia compras." },
  { value: "operador", label: "Operador", desc: "Registra entradas, saídas, transferências e contagens." },
];

const RoleBadge = ({ role }: { role: User["role"] }) => {
  if (role === "admin")
    return <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-[11.5px] font-medium text-red-300"><ShieldCheck className="size-3.5" /> Administrador</span>;
  if (role === "gerente")
    return <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[11.5px] font-medium text-sky-300"><UserCog className="size-3.5" /> Gerente</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[11.5px] font-medium text-zinc-400"><Shield className="size-3.5" /> Operador</span>;
};

export default function UsuariosPage() {
  const { push } = useToast();
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { mode: "create" | "edit"; row?: User }>(null);
  const [pwFor, setPwFor] = useState<User | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<{ users: User[] }>("/api/users");
    if (r.ok) setRows(r.data.users ?? []);
    else push({ kind: "error", title: "Não foi possível carregar os usuários", msg: r.error });
    setLoading(false);
    const lg = await apiGet<{ logs: Log[] }>("/api/audit");
    if (lg.ok) setLogs(lg.data.logs ?? []);
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (u: User) => {
    const r = await api(`/api/users/${u.id}`, { method: "PATCH", json: { active: !u.active } });
    if (r.ok) {
      push({ kind: "success", title: u.active ? "Usuário inativado" : "Usuário reativado" });
      load();
    } else push({ kind: "error", title: "Não foi possível alterar", msg: r.error });
  };

  const remove = async (u: User) => {
    if (!confirm(`Excluir o usuário "${u.name}"? Essa ação não pode ser desfeita.`)) return;
    const r = await api(`/api/users/${u.id}`, { method: "DELETE" });
    if (r.ok) {
      push({ kind: "success", title: "Usuário excluído" });
      load();
    } else push({ kind: "error", title: "Não foi possível excluir", msg: r.error });
  };

  const exportPdf = (print: boolean) =>
    pdfList<User>({
      org: "Sushi Diamantino",
      title: "Usuários do sistema",
      subtitle: "Contas de acesso, perfis de permissão e último acesso registrado.",
      landscape: true,
      print,
      kpis: [
        { label: "Usuários", value: String(rows.length) },
        { label: "Ativos", value: String(rows.filter((u) => u.active).length) },
        { label: "Administradores", value: String(rows.filter((u) => u.role === "admin").length) },
        { label: "Sessões abertas", value: String(rows.reduce((a, u) => a + u.activeSessions, 0)) },
      ],
      columns: [
        { header: "Nome", value: (u) => u.name },
        { header: "Usuário", value: (u) => u.username },
        { header: "Perfil", align: "center", value: (u) => u.roleLabel },
        { header: "Área / turno", value: (u) => `${u.workArea ?? "-"}${u.shift ? ` · ${u.shift}` : ""}` },
        { header: "Último acesso", value: (u) => (u.lastAccessAt ? formatDateTime(u.lastAccessAt) : "nunca acessou") },
        { header: "Sessões", align: "right", value: (u) => u.activeSessions },
        { header: "Situação", align: "center", value: (u) => (u.active ? "Ativo" : "Inativo") },
      ],
      rows,
      filename: "usuarios",
    });

  const active = rows.filter((u) => u.active).length;
  const admins = rows.filter((u) => u.role === "admin").length;

  return (
    <div className="animate-fade-in">
      <p className="text-[12px] text-zinc-500">
        Sistema <span className="mx-1.5 text-zinc-700">›</span> <span className="text-zinc-300">Usuários</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2.5 text-[28px] font-bold tracking-tight text-white">
              <Users className="size-7 text-zinc-400" /> Usuários
            </h2>
            <PageBadge>Perfis e acessos</PageBadge>
          </div>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-zinc-400">
            Somente o Administrador cria e gerencia contas. Cada pessoa entra com o seu usuário e a senha
            é trocada no primeiro acesso.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <PdfButton build={exportPdf} disabled={rows.length === 0} />
          <PrimaryButton onClick={() => setModal({ mode: "create" })}>
            <Plus className="size-4" /> Novo usuário
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Usuários cadastrados" value={rows.length} hint={`${active} ativo(s)`} icon={<Users className="size-4" />} />
        <StatCard label="Administradores" value={admins} hint="Acesso total ao sistema" icon={<ShieldCheck className="size-4" />} />
        <StatCard label="Gerentes" value={rows.filter((u) => u.role === "gerente").length} hint="Confirmações e fechamentos" icon={<UserCog className="size-4" />} />
        <StatCard label="Sessões abertas" value={rows.reduce((a, u) => a + u.activeSessions, 0)} hint="Sessões ativas de 7 dias" icon={<Monitor className="size-4" />} />
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h3 className="text-[15px] font-semibold text-white">Contas de acesso</h3>
          <button onClick={load} className="flex items-center gap-1.5 text-[12.5px] font-medium text-zinc-400 transition hover:text-white">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Atualizar
          </button>
        </div>
        {loading ? (
          <LoadingRows label="Carregando usuários…" />
        ) : (
          <TableShell head={<><Th>Usuário</Th><Th>Perfil</Th><Th>Área / turno</Th><Th>Último acesso</Th><Th>Situação</Th><Th className="text-right">Ações</Th></>}>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[13.5px] text-zinc-500">Nenhum usuário encontrado.</td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="transition hover:bg-white/[0.02]">
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-[#232329] text-[12px] font-bold text-white">
                        {u.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-white">{u.name}</p>
                        <p className="font-mono text-[11.5px] text-zinc-500">
                          {u.username}
                          {u.mustChangePassword ? <span className="ml-1.5 text-amber-400">· troca de senha pendente</span> : null}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td><RoleBadge role={u.role} /></Td>
                  <Td>
                    <p className="text-[12.5px] text-zinc-300">{u.workArea ?? "—"}</p>
                    <p className="text-[11.5px] text-zinc-500">{u.shift ?? "—"}</p>
                  </Td>
                  <Td>
                    <p className="text-[12.5px] text-zinc-300">{u.lastAccessAt ? formatDateTime(u.lastAccessAt) : "nunca acessou"}</p>
                    {u.activeSessions > 0 ? (
                      <p className="text-[11.5px] text-emerald-400">{u.activeSessions} sessão(ões) ativa(s)</p>
                    ) : null}
                  </Td>
                  <Td>
                    {u.active ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11.5px] font-medium text-emerald-300">
                        <span className="size-1.5 rounded-full bg-current" /> Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[11.5px] font-medium text-zinc-400">
                        <span className="size-1.5 rounded-full bg-current" /> Inativo
                      </span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Redefinir senha" onClick={() => setPwFor(u)} className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-amber-300">
                        <KeyRound className="size-4" />
                      </button>
                      <button title="Editar" onClick={() => setModal({ mode: "edit", row: u })} className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white">
                        <Pencil className="size-4" />
                      </button>
                      <button title={u.active ? "Inativar" : "Reativar"} onClick={() => toggle(u)} className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white">
                        <Power className="size-4" />
                      </button>
                      <button title="Excluir" onClick={() => remove(u)} className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-red-400">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </TableShell>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
        <div className="px-5 pt-5">
          <h3 className="text-[15px] font-semibold text-white">Atividade recente</h3>
          <p className="mt-0.5 text-[12.5px] text-zinc-500">Acessos e alterações de usuário registradas no sistema</p>
        </div>
        {logs.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-zinc-500">Nenhum registro ainda.</p>
        ) : (
          <div className="mt-3 divide-y divide-white/[0.05]">
            {logs.slice(0, 20).map((l) => (
              <div key={l.id} className="flex items-start gap-3 px-5 py-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-zinc-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] text-zinc-200">
                    <strong className="font-semibold text-white">{l.userName ?? "sistema"}</strong>{" "}
                    {ACTION_LABEL[l.action] ?? l.action}
                    {l.target ? <span className="text-zinc-500"> · {l.target}</span> : null}
                  </p>
                  {l.details ? <p className="text-[11.5px] text-zinc-500">{l.details}</p> : null}
                </div>
                <span className="shrink-0 text-[11.5px] text-zinc-600">{formatDateTime(l.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <UserModal modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      <PasswordModal user={pwFor} onClose={() => setPwFor(null)} />
    </div>
  );
}

function UserModal({
  modal,
  onClose,
  onSaved,
}: {
  modal: null | { mode: "create" | "edit"; row?: User };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    role: "operador" as User["role"],
    workArea: "",
    shift: "",
    phone: "",
    email: "",
    notes: "",
    active: true,
    mustChangePassword: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!modal) return;
    if (modal.mode === "edit" && modal.row) {
      const u = modal.row;
      setForm({
        name: u.name,
        username: u.username,
        password: "",
        role: u.role,
        workArea: u.workArea ?? "",
        shift: u.shift ?? "",
        phone: u.phone ?? "",
        email: u.email ?? "",
        notes: u.notes ?? "",
        active: u.active,
        mustChangePassword: u.mustChangePassword,
      });
    } else {
      setForm({ name: "", username: "", password: "", role: "operador", workArea: "", shift: "", phone: "", email: "", notes: "", active: true, mustChangePassword: true });
    }
  }, [modal]);

  if (!modal) return null;
  const isCreate = modal.mode === "create";

  const save = async () => {
    if (saving) return;
    if (!form.name.trim()) return push({ kind: "error", title: "Informe o nome" });
    if (isCreate) {
      if (form.password.length < 6) return push({ kind: "error", title: "A senha precisa de ao menos 6 caracteres" });
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: form.name,
      role: form.role,
      workArea: form.workArea,
      shift: form.shift,
      phone: form.phone,
      email: form.email,
      notes: form.notes,
      active: form.active,
      mustChangePassword: form.mustChangePassword,
    };
    if (isCreate) {
      payload.username = form.username;
      payload.password = form.password;
    }
    const r = isCreate
      ? await api("/api/users", { method: "POST", json: payload })
      : await api(`/api/users/${modal.row!.id}`, { method: "PATCH", json: payload });
    setSaving(false);
    if (r.ok) {
      push({ kind: "success", title: isCreate ? "Usuário criado" : "Usuário atualizado", msg: form.name });
      onSaved();
    } else {
      push({ kind: "error", title: "Não foi possível salvar", msg: r.error });
    }
  };

  return (
    <Modal open onClose={saving ? () => {} : onClose} wide title={isCreate ? "Novo usuário" : `Editar ${modal.row?.name}`} subtitle={isCreate ? "A senha será trocada no primeiro acesso" : "Perfil, situação e dados de contato"}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome completo" required>
            <input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Kenji Tanaka" className={inputCls} />
          </Field>
          <Field label="Usuário (login)" required hint={isCreate ? "3 a 40 caracteres: letras minúsculas, números, . _ -" : "Não pode ser alterado"}>
            <input
              value={form.username}
              disabled={!isCreate}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
              placeholder="kenji.tanaka"
              className={`${inputCls} font-mono disabled:opacity-60`}
            />
          </Field>
        </div>

        {isCreate ? (
          <Field label="Senha inicial" required hint="Mínimo de 6 caracteres · o usuário troca no primeiro acesso">
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Ex.: diamantino2026" className={inputCls} />
          </Field>
        ) : null}

        <div>
          <p className="mb-2 text-[12.5px] font-medium text-zinc-400">Perfil de permissão</p>
          <div className="space-y-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => setForm({ ...form, role: r.value })}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition",
                  form.role === r.value ? "border-white/30 bg-white/[0.07]" : "border-white/[0.07] hover:border-white/15"
                )}
              >
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold", form.role === r.value ? "border-emerald-400 bg-emerald-400 text-zinc-950" : "border-white/20")}>
                  {form.role === r.value ? "✓" : ""}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-white">{r.label}</span>
                  <span className="block text-[12px] text-zinc-500">{r.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Área de trabalho"><input value={form.workArea} maxLength={80} onChange={(e) => setForm({ ...form, workArea: e.target.value })} placeholder="Ex.: Sala de estoque" className={inputCls} /></Field>
          <Field label="Turno"><input value={form.shift} maxLength={40} onChange={(e) => setForm({ ...form, shift: e.target.value })} placeholder="Ex.: Turno tarde" className={inputCls} /></Field>
          <Field label="Telefone"><input value={form.phone} maxLength={40} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 90000-0000" className={inputCls} /></Field>
          <Field label="E-mail"><input value={form.email} maxLength={120} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nome@sushidiamantino.com" className={inputCls} /></Field>
        </div>

        <Field label="Observações"><textarea value={form.notes} maxLength={500} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Anotações internas" className={`${inputCls} resize-none`} /></Field>

        <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 sm:grid-cols-2">
          <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Usuário ativo" />
          <Toggle checked={form.mustChangePassword} onChange={(v) => setForm({ ...form, mustChangePassword: v })} label="Exigir troca de senha no acesso" />
        </div>

        <div className="flex justify-end gap-2.5 border-t border-white/[0.06] pt-4">
          <button onClick={onClose} disabled={saving} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white disabled:opacity-50">Cancelar</button>
          <PrimaryButton onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : null} {isCreate ? "Criar usuário" : "Salvar alterações"}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

function PasswordModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { push } = useToast();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setPw("");
  }, [user]);

  if (!user) return null;

  const save = async () => {
    if (busy) return;
    if (pw.length < 6) return push({ kind: "error", title: "A senha precisa de ao menos 6 caracteres" });
    setBusy(true);
    const r = await api("/api/auth/password", { method: "PATCH", json: { userId: user.id, newPassword: pw } });
    setBusy(false);
    if (r.ok) {
      push({ kind: "success", title: "Senha redefinida", msg: "O usuário deverá trocá-la no próximo acesso." });
      onClose();
    } else {
      push({ kind: "error", title: "Não foi possível redefinir", msg: r.error });
    }
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={`Redefinir senha de ${user.name}`} subtitle="A senha atual será substituída e as sessões abertas serão encerradas.">
      <div className="space-y-4">
        <Field label="Nova senha" required hint="Mínimo de 6 caracteres">
          <input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Nova senha" className={inputCls} />
        </Field>
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[12.5px] text-amber-200">
          Repasse a nova senha por um canal seguro. No próximo acesso o usuário será obrigado a trocá-la.
        </p>
        <div className="flex justify-end gap-2.5">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white">Cancelar</button>
          <PrimaryButton onClick={save} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Redefinir senha</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
