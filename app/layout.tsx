import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { ClaimPerfilGate } from "@/components/ClaimPerfilGate";
import { CreditoRogmaLab } from "@/components/CreditoRogmaLab";
import { Navigation } from "@/components/navigation";
import { Toaster } from "@/components/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tenis La Vía",
  description: "Plataforma de gestión de torneos de Tenis La Vía",
  icons: {
    icon: '/icon',
  },
  themeColor: '#10b981',
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground print:bg-white print:text-black md:flex">
        <AuthProvider>
          <Navigation />
          <div className="flex min-h-screen flex-1 flex-col pb-20 print:pb-0 md:pb-0">
            <div className="flex-1">
              <ClaimPerfilGate>{children}</ClaimPerfilGate>
            </div>
            <CreditoRogmaLab />
          </div>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
