import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "个人任务管理",
  description: "本机个人任务管理工具"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
