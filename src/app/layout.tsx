import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "폴리톡 Alpha",
  description: "AI cross-language academic discussion rooms for students in Korea.",
  icons: {
    icon: "/brand/polytalk-app-icon.png",
    apple: "/brand/polytalk-app-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
