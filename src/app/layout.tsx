import type { Metadata } from "next";
import { Inter, Noto_Sans_SC } from "next/font/google";

import "./globals.css";

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

const cjkFont = Noto_Sans_SC({
  variable: "--font-cjk",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  fallback: ["PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "sans-serif"],
});

export const metadata: Metadata = {
  title: "明证 MingEvidence",
  description: "中国版 OpenEvidence 的第一版产品骨架，面向中国医生的 AI 临床证据平台。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${bodyFont.variable} ${cjkFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
