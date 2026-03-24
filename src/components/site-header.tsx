import Link from "next/link";

import { getOptionalDoctorSession } from "@/lib/auth";
import { brandSummary } from "@/lib/platform-data";

type SiteHeaderProps = {
  current?: "home" | "search" | "consult" | "progress" | "cases";
};

export async function SiteHeader({ current = "home" }: SiteHeaderProps) {
  const doctor = await getOptionalDoctorSession();

  return (
    <header className="site-header">
      <Link className="brand-mark" href="/">
        <span className="brand-mark__kanji">{brandSummary.name}</span>
        <span className="brand-mark__meta">
          <strong>{brandSummary.englishName}</strong>
          <span>{brandSummary.oneLiner}</span>
        </span>
      </Link>
      <nav className="site-nav" aria-label="主导航">
        <Link
          className={current === "home" ? "nav-link is-active" : "nav-link"}
          href="/"
        >
          产品首页
        </Link>
        <Link
          className={current === "search" ? "nav-link is-active" : "nav-link"}
          href="/search"
        >
          证据搜索
        </Link>
        <Link
          className={current === "cases" ? "nav-link is-active" : "nav-link"}
          href="/cases"
        >
          病例工作台
        </Link>
        <Link
          className={current === "progress" ? "nav-link is-active" : "nav-link"}
          href="/progress"
        >
          进展看板
        </Link>
        <Link
          className={current === "consult" ? "nav-link is-active" : "nav-link"}
          href="/deep-consult"
        >
          DeepConsult
        </Link>
      </nav>
      {doctor ? (
        <div className="session-badge">
          <div>
            <strong>{doctor.name}</strong>
            <span>
              {doctor.hospital} / {doctor.specialty}
            </span>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit">退出</button>
          </form>
        </div>
      ) : (
        <Link className="session-entry" href="/login">
          医生登录
        </Link>
      )}
    </header>
  );
}
