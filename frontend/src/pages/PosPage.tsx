import { WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PosCartTable,
  type PosCartItem,
} from "../components/pos/PosCartTable";
import {
  PosCheckoutModal,
  type CheckoutValues,
} from "../components/pos/PosCheckoutModal";
import {
  PosProductSearch,
  type PosProduct,
} from "../components/pos/PosProductSearch";
import { SaleReceipt, type SaleReceiptData } from "../components/pos/SaleReceipt";
import "../components/pos/pos.module.css";
import { api, getApiErrorMessage } from "../lib/api";
import { nullable, numeric, runApiAction } from "../lib/actionHelpers";
import {
  getAvailableStockByProduct,
  type InventoryStockRow,
} from "../lib/posInventory";

type CashSession = {
  id: string;
  status: string;
  cashRegister?: { name: string } | null;
};
type PosData = {
  products: PosProduct[];
  stockRows: InventoryStockRow[];
  cashSessions: CashSession[];
};
type ItemsResponse<T> = { items?: T[] };
type SessionsResponse = { sessions?: CashSession[] };
type CheckoutResponse = { sale: SaleReceiptData };

const norm = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const PosPage = () => {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [stockRows, setStockRows] = useState<InventoryStockRow[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("TODAS");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async (): Promise<PosData> => {
    const [
      productsResponse,
      stockResponse,
      sessionsResponse,
    ] = await Promise.all([
      api.get<ItemsResponse<PosProduct>>("/products?limit=100"),
      api.get<ItemsResponse<InventoryStockRow>>("/inventory/stock?limit=100"),
      api.get<SessionsResponse>("/cash/sessions?limit=100"),
    ]);

    return {
      products: productsResponse.data.items ?? [],
      stockRows: stockResponse.data.items ?? [],
      cashSessions: sessionsResponse.data.sessions ?? [],
    };
  }, []);

  const applyData = useCallback((data: PosData) => {
    setProducts(data.products);
    setStockRows(data.stockRows);
    setCashSessions(data.cashSessions);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      applyData(await fetchData());
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [applyData, fetchData]);

  useEffect(() => {
    let active = true;

    void fetchData()
      .then((data) => {
        if (active) {
          applyData(data);
          setLoading(false);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(getApiErrorMessage(requestError));
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [applyData, fetchData]);

  const stockByProduct = useMemo(
    () => getAvailableStockByProduct(stockRows),
    [stockRows],
  );

  const categories = useMemo(
    () => [
      "TODAS",
      ...Array.from(
        new Set(
          products
            .map((product) => product.category?.name)
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort((a, b) => a.localeCompare(b, "es")),
    ],
    [products],
  );
  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          product.isActive &&
          (category === "TODAS" || product.category?.name === category) &&
          (!query ||
            norm(
              [
                product.name,
                product.sku,
                product.barcode ?? "",
                product.category?.name ?? "",
              ].join(" "),
            ).includes(norm(query))),
      ),
    [products, category, query],
  );
  const openCash =
    cashSessions.find((session) => session.status === "OPEN") ?? null;
  const total = cart.reduce(
    (sum, item) => sum + Number(item.product.salePrice) * item.quantity,
    0,
  );
  const units = cart.reduce((sum, item) => sum + item.quantity, 0);
  const hasRetainedPrescription = cart.some(
    (item) => item.product.prescriptionType === "RETAINED",
  );
  const hasAvailableStock = products.some(
    (product) =>
      product.isActive && (stockByProduct.get(product.id) ?? 0) > 0,
  );

  const add = (product: PosProduct) => {
    const stock = stockByProduct.get(product.id) ?? 0;
    if (stock <= 0) return;

    const maxQuantity = stock;

    setError("");
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                stock,
                maxQuantity,
                quantity: Math.min(item.quantity + 1, maxQuantity),
              }
            : item,
        );
      }

      return [
        ...current,
        {
          product,
          quantity: 1,
          stock,
          maxQuantity,
          prescriptionConfirmed: false,
          prescriptionRetained: false,
        },
      ];
    });
  };

  const updateQuantity = (productId: string, quantity: number) =>
    setCart((current) =>
      current
        .map((item) => {
          if (item.product.id !== productId) return item;
          return {
            ...item,
            quantity: Math.min(Math.max(quantity, 0), item.maxQuantity),
          };
        })
        .filter((item) => item.quantity > 0),
    );

  const checkoutInitialValues = useMemo(
    () => ({ paymentMethod: "CASH", taxDocumentType: "RECEIPT" }),
    [],
  );

  const checkout = async (values: CheckoutValues) => {
    if (!openCash) {
      setError("Debes abrir una caja antes de cobrar.");
      return;
    }

    const taxDocumentType = String(values.taxDocumentType);
    const customerRut = nullable(values.customerRut);
    const customerBusinessName = nullable(values.customerBusinessName);
    const customerBusinessActivity = nullable(values.customerBusinessActivity);
    const customerAddress = nullable(values.customerAddress);

    if (
      taxDocumentType === "INVOICE" &&
      (!customerRut ||
        !customerBusinessName ||
        !customerBusinessActivity ||
        !customerAddress)
    ) {
      setError(
        "Para emitir factura debes completar RUT cliente, razón social, giro y dirección.",
      );
      return;
    }

    let receipt: SaleReceiptData | null = null;
    const succeeded = await runApiAction(
      async () => {
        const response = await api.post<CheckoutResponse>("/sales/checkout", {
          code: `VTA-${Date.now()}`,
          cashSessionId: openCash.id,
          customerRut,
          customerName: nullable(values.customerName),
          customerBusinessName,
          customerBusinessActivity,
          customerAddress,
          notes: nullable(values.notes),
          taxRate: 19,
          taxDocumentType,
          items: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            discountAmount: 0,
            prescriptionConfirmed: item.prescriptionConfirmed,
            prescriptionRetained: item.prescriptionRetained,
            locationId: null,
          })),
          payments: [
            {
              method: String(values.paymentMethod),
              amount: numeric(total),
              referenceCode: nullable(values.referenceCode),
            },
          ],
        });
        receipt = response.data.sale;
      },
      setBusy,
      setError,
      async () => {
        setCart([]);
        setCheckoutOpen(false);
        await load();
      },
    );
    if (succeeded && receipt) setCompletedSale(receipt);
  };

  return (
    <div className={`pos-v2 ${hasRetainedPrescription ? "pos-v2--retained" : ""}`}>
      <header className="pos-v2__header">
        <div>
          <span className="pos-v2__eyebrow">Punto de venta</span>
          <h1>POS</h1>
          <p>Venta rápida con control de receta e inventario FEFO.</p>
        </div>
        <div
          className={`pos-v2__cash ${openCash ? "pos-v2__cash--open" : ""}`}
        >
          <WalletCards size={17} />
          <div>
            <span>Estado de caja</span>
            <strong>
              {openCash
                ? (openCash.cashRegister?.name ?? "Caja abierta")
                : "Sin caja abierta"}
            </strong>
          </div>
        </div>
      </header>

      {error ? <div className="alert alert--error">{error}</div> : null}

      {!loading && (!openCash || !hasAvailableStock) ? (
        <div className="alert" role="status">
          <strong>Antes de vender:</strong>{" "}
          {!openCash ? "abre una caja. " : ""}
          {!hasAvailableStock
            ? "recibe una compra con lote y cantidad para habilitar productos. "
            : ""}
          <span>
            {!openCash ? <Link to="/cash">Ir a Control de caja</Link> : null}
            {!openCash && !hasAvailableStock ? " · " : null}
            {!hasAvailableStock ? (
              <Link to="/purchases">Ir a Compras</Link>
            ) : null}
          </span>
        </div>
      ) : null}

      <section className="pos-v2__layout">
        <PosProductSearch
          query={query}
          category={category}
          categories={categories}
          products={filtered}
          stockByProduct={stockByProduct}
          loading={loading}
          onQueryChange={setQuery}
          onCategoryChange={setCategory}
          onReload={() => void load()}
          onAddProduct={add}
        />

        <PosCartTable
          cart={cart}
          units={units}
          total={total}
          hasOpenCash={Boolean(openCash)}
          onUpdateQuantity={updateQuantity}
          onUpdatePrescription={(productId, field, value) =>
            setCart((current) =>
              current.map((item) =>
                item.product.id === productId
                  ? { ...item, [field]: value }
                  : item,
              ),
            )
          }
          onRemoveItem={(productId) =>
            setCart((current) =>
              current.filter((candidate) => candidate.product.id !== productId),
            )
          }
          onOpenCheckout={() => setCheckoutOpen(true)}
        />
      </section>

      <PosCheckoutModal
        open={checkoutOpen}
        total={total}
        initialValues={checkoutInitialValues}
        busy={busy}
        error={error}
        onClose={() => setCheckoutOpen(false)}
        onSubmit={checkout}
      />
      {completedSale ? (
        <SaleReceipt
          sale={completedSale}
          onClose={() => setCompletedSale(null)}
        />
      ) : null}
    </div>
  );
};
