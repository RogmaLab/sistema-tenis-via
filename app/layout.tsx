import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
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
  title: "Tenis La Vía - Panel de Control",
  description: "Plataforma de gestión de torneos de Tenis La Vía",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground md:flex">
        <AuthProvider>
          <Navigation />
          {/* pb-20: deja aire para el BottomNav en mobile (no tapa CTAs/listas) */}
          <div className="flex-1 pb-20 md:pb-0">{children}</div>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
