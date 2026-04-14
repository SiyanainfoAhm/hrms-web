import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "../components/common/ThemeProvider";

export const metadata: Metadata = {
  title: "Master Frontend Starter",
  description: "Reusable frontend starter for CRUD-heavy web apps."
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

