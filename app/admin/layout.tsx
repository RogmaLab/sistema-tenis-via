import { AdminRouteGuard } from "@/components/AdminRouteGuard";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminRouteGuard>{children}</AdminRouteGuard>;
}
