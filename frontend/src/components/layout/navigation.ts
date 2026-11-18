import {
  Boxes,
  ClipboardList,
  FileChartColumn,
  LayoutDashboard,
  Pill,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  UserRoundCog,
  WalletCards,
} from "lucide-react";

export const navigation = [
  {
    label: "General",
    items: [
      {
        label: "Dashboard",
        to: "/",
        icon: LayoutDashboard,
        permission: "reports.read",
      },
    ],
  },
  {
    label: "Operación",
    items: [
      {
        label: "POS / Ventas",
        to: "/pos",
        icon: ShoppingBag,
        permission: "sales.create",
      },
      {
        label: "Caja",
        to: "/cash",
        icon: WalletCards,
        permission: "cash.read",
      },
      {
        label: "Ventas",
        to: "/sales",
        icon: ReceiptText,
        permission: "sales.read",
      },
      {
        label: "Inventario",
        to: "/inventory",
        icon: Boxes,
        permission: "inventory.read",
      },
      {
        label: "Compras",
        to: "/purchases",
        icon: ClipboardList,
        permission: "purchases.read",
      },
    ],
  },
  {
    label: "Farmacia",
    items: [
      {
        label: "Productos",
        to: "/products",
        icon: Pill,
        permission: "products.read",
      },
    ],
  },
  {
    label: "Administración",
    items: [
      {
        label: "Usuarios",
        to: "/users",
        icon: UserRoundCog,
        permission: "users.read",
      },
      {
        label: "Reportes",
        to: "/reports",
        icon: FileChartColumn,
        permission: "reports.read",
      },
      {
        label: "Auditoría",
        to: "/audit",
        icon: ShieldCheck,
        permission: "audit.read",
      },
      {
        label: "Configuración",
        to: "/settings",
        icon: Settings,
        permission: "settings.manage",
      },
    ],
  },
] as const;
