import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "../components/common/ThemeProvider";

export const metadata: Metadata = {
  title: "HR Management System",
  description: "Human resources management system"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

