import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { ClaimPerfilGate } from "@/components/ClaimPerfilGate";
import { CreditoRogmaLab } from "@/components/CreditoRogmaLab";
import { PublicNavbar } from "@/components/PublicNavbar";
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
  description:
    "Cartelera de torneos, ranking, llaves y horarios de Tenis La Vía",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <PublicNavbar />
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
