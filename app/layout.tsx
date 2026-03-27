import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta"
});

export const metadata: Metadata = {
  title: "Agência SaaS",
  description: "Plataforma de gestão para pequenas agências de publicidade.",
  icons: {
    icon: "/favicon-brifa.svg",
    shortcut: "/favicon-brifa.svg",
    apple: "/favicon-brifa.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${font.variable} font-sans`}>{children}</body>
    </html>
  );
}
