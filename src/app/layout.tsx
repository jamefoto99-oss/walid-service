import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "อู่วาลิดการช่าง",
  description: "ระบบบริหารจัดการอู่ซ่อมรถยนต์และเอกสารบัญชี",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
