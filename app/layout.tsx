import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const font = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins"
});

export const metadata: Metadata = {
  title: "Agência SaaS",
  description: "Plataforma de gestão para pequenas agências de publicidade.",
  icons: {
    icon: "/icon.svg?v=3",
    shortcut: "/icon.svg?v=3",
    apple: "/apple-icon.svg?v=3"
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
