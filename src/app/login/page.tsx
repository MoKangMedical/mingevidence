import { SiteHeader } from "@/components/site-header";
import { sanitizeNextPath } from "@/lib/auth";

function readQueryValue(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return "";
}

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const nextPath = sanitizeNextPath(readQueryValue(searchParams.next));
  const error = readQueryValue(searchParams.error);

  return (
    <main className="app-shell">
      <div className="aurora aurora--left" />
      <div className="aurora aurora--right" />
      <SiteHeader />

      <section className="login-shell">
        <div className="login-copy">
          <span className="eyebrow">Doctor Access</span>
          <h1>明证当前只向经过验证的医生开放。</h1>
          <p>
            这一层是按 OpenEvidence 的产品模式搭的。搜索、DeepConsult、反馈和审计都绑定医生身份，不对患者端开放。
          </p>
          <ul className="bullet-list">
            <li>登录后可访问证据搜索、DeepConsult 和真实检索接口。</li>
            <li>每次搜索和反馈都会进入审计日志，便于后续医院试点和合规追踪。</li>
            <li>高风险问题默认拒答，不直接生成急救或个体化高危给药建议。</li>
          </ul>
        </div>

        <form className="login-card" action="/api/auth/login" method="post">
          <input name="next" type="hidden" value={nextPath} />
          <span className="eyebrow">Sign In</span>
          <h2>医生登录</h2>
          <label htmlFor="email">邮箱</label>
          <input
            autoComplete="email"
            id="email"
            name="email"
            placeholder="lin.oncology@mingzheng.local"
            required
            type="email"
          />
          <label htmlFor="password">密码</label>
          <input
            autoComplete="current-password"
            id="password"
            name="password"
            placeholder="输入演示账号密码"
            required
            type="password"
          />
          {error ? (
            <p className="login-card__error">登录失败，请检查账号密码。</p>
          ) : null}
          <button type="submit">进入医生工作台</button>
          <div className="demo-card">
            <strong>演示账号</strong>
            <p>
              <code>lin.oncology@mingzheng.local</code> / <code>doctor123</code>
            </p>
            <p>
              <code>zhou.cardio@mingzheng.local</code> / <code>oncology2026</code>
            </p>
          </div>
        </form>
      </section>
    </main>
  );
}
