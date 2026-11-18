import { Check, Printer, X } from "lucide-react";
import "./SaleReceipt.css";

type ReceiptItem = {
  quantity: number;
  unitPrice: number | string;
  discountAmount: number | string;
  totalAmount: number | string;
  product: { name: string; sku: string };
};

type ReceiptPayment = {
  method: string;
  amount: number | string;
};

export type SaleReceiptData = {
  id: string;
  code: string;
  saleDate: string;
  customerRut: string | null;
  customerName: string | null;
  customerBusinessName: string | null;
  customerBusinessActivity: string | null;
  customerAddress: string | null;
  subtotal: number | string;
  discountAmount: number | string;
  netAmount: number | string;
  taxAmount: number | string;
  totalAmount: number | string;
  seller: { firstName: string; lastName: string; username: string };
  items: ReceiptItem[];
  payments: ReceiptPayment[];
  taxDocument: { type: string; folio: string | null; status: string } | null;
};

type Props = {
  sale: SaleReceiptData;
  onClose: () => void;
};

const currency = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const paymentLabels: Record<string, string> = {
  CASH: "Efectivo",
  DEBIT_CARD: "Tarjeta de débito",
  CREDIT_CARD: "Tarjeta de crédito",
  BANK_TRANSFER: "Transferencia",
  OTHER: "Otro",
};

export const SaleReceipt = ({ sale, onClose }: Props) => {
  const isInvoice = sale.taxDocument?.type === "INVOICE";
  const customerName =
    sale.customerBusinessName || sale.customerName || "Cliente general";

  return (
    <div className="receipt-overlay">
      <section
        className="receipt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        <div className="receipt-actions">
          <div className="receipt-success">
            <Check size={18} />
            <span>Venta completada</span>
          </div>
          <div className="receipt-action-buttons">
            <button
              className="button button--primary"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              Imprimir / Guardar PDF
            </button>
            <button
              className="receipt-close"
              onClick={onClose}
              aria-label="Cerrar comprobante"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        <article className="receipt-paper">
          <header className="receipt-heading">
            <strong>FARMAGESTIÓN</strong>
            <span>Farmacia INACAP</span>
            <h2 id="receipt-title">
              {isInvoice ? "Comprobante de venta" : "Boleta de venta"}
            </h2>
            <span>N.º {sale.taxDocument?.folio || sale.code}</span>
          </header>

          <div className="receipt-meta">
            <div>
              <span>Fecha</span>
              <strong>{new Date(sale.saleDate).toLocaleString("es-CL")}</strong>
            </div>
            <div>
              <span>Vendedor</span>
              <strong>
                {sale.seller.firstName} {sale.seller.lastName}
              </strong>
            </div>
          </div>

          <div className="receipt-customer">
            <span>Cliente</span>
            <strong>{customerName}</strong>
            {sale.customerRut ? <span>RUT: {sale.customerRut}</span> : null}
            {sale.customerBusinessActivity ? (
              <span>Giro: {sale.customerBusinessActivity}</span>
            ) : null}
            {sale.customerAddress ? (
              <span>Dirección: {sale.customerAddress}</span>
            ) : null}
          </div>

          <table className="receipt-items">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={`${sale.id}-${item.product.sku}-${item.product.name}`}>
                  <td>
                    <strong>{item.product.name}</strong>
                    <span>
                      {currency.format(Number(item.unitPrice))} c/u
                      {Number(item.discountAmount) > 0
                        ? ` · Desc. ${currency.format(Number(item.discountAmount))}`
                        : ""}
                    </span>
                  </td>
                  <td>{item.quantity}</td>
                  <td>{currency.format(Number(item.totalAmount))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="receipt-totals">
            <div>
              <span>Subtotal</span>
              <strong>{currency.format(Number(sale.subtotal))}</strong>
            </div>
            {Number(sale.discountAmount) > 0 ? (
              <div>
                <span>Descuentos</span>
                <strong>
                  -{currency.format(Number(sale.discountAmount))}
                </strong>
              </div>
            ) : null}
            <div>
              <span>Neto</span>
              <strong>{currency.format(Number(sale.netAmount))}</strong>
            </div>
            <div>
              <span>IVA</span>
              <strong>{currency.format(Number(sale.taxAmount))}</strong>
            </div>
            <div className="receipt-grand-total">
              <span>Total pagado</span>
              <strong>{currency.format(Number(sale.totalAmount))}</strong>
            </div>
          </div>

          <div className="receipt-payment">
            <span>Medio de pago</span>
            {sale.payments.map((payment, index) => (
              <div key={`${payment.method}-${index}`}>
                <span>{paymentLabels[payment.method] ?? payment.method}</span>
                <strong>{currency.format(Number(payment.amount))}</strong>
              </div>
            ))}
          </div>

          <footer className="receipt-footer">
            <strong>Gracias por su compra</strong>
            <span>Venta: {sale.code}</span>
            <span>
              Comprobante de uso interno. La emisión tributaria ante el SII no
              está integrada.
            </span>
          </footer>
        </article>
      </section>
    </div>
  );
};
