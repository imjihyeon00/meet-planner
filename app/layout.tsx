import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "약속정하기",
  description: "친구 약속 일정 조율 서비스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
