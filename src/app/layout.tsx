import type { Metadata } from "next";
import { IBM_Plex_Sans, Libre_Baskerville } from "next/font/google";

import "./globals.css";

const bodyFont = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  fallback: ["PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "sans-serif"],
});

const displayFont = Libre_Baskerville({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  fallback: ["STSong", "Songti SC", "serif"],
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
    <html lang="zh-CN" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
