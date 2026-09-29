import { NextRequest, NextResponse } from "next/server";

/**
 * Proteção de rotas (middleware).
 *
 * O runtime edge não carrega o driver `pg`, então a validação pesada de sessão
 * fica nas rotas de API (Node runtime) — este middleware cuida do essencial:
 *   - sem cookie de sessão, API responde 401 e páginas vão para /login;
 *   - páginas públicas e /api/auth/* passam sempre.
 *
 * A verificação completa (sessão expirada, usuário inativo, troca de senha
 * obrigatória e permissão por perfil) acontece em /api/auth/me e em cada rota
 * protegida, além do redirecionamento client-side do AuthProvider.
 */

const PUBLIC_API = ["/api/auth/login", "/api/auth/me", "/api/auth/logout", "/api/health"];
const PUBLIC_PAGES = ["/login", "/alterar-senha", "/sem-permissao", "/imprimir/relatorio"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API.some((p) => pathname === p)) return NextResponse.next();
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const hasSession = Boolean(req.cookies.get("sd_session")?.value);
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);

  // Sem sessão: barra já na porta. Quem tem cookie passa e é validado nas rotas
  // (sessão expirada, inativo, troca de senha e perfil).
  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sessão não iniciada." }, { status: 401 });
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|css|js|woff2?|map)$).*)"],
};
