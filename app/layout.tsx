import type React from "react"
import type { Metadata } from "next"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"
import { ErrorReporter, ConsoleReporter, ReactErrorBoundary } from "@/components/error-reporter"
import { AppAnalytics } from "@/components/app-analytics"

export const metadata: Metadata = {
  title: "OASI | Dispensador inteligente de medicamentos",
  description: "Gestiona horarios y conecta tu dispensador OASI de forma sencilla.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">
        <ReactErrorBoundary>
          {children}
        </ReactErrorBoundary>
        <Toaster theme="dark" />
        <ErrorReporter />
        <ConsoleReporter />
        <AppAnalytics />
      </body>
    </html>
  );
}
