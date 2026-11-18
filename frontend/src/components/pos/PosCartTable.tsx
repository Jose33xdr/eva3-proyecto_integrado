import {
  AlertTriangle,
  ChevronRight,
  Minus,
  Pill,
  Plus,
  ReceiptText,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import type { PosProduct } from "./PosProductSearch";
import "./pos.module.css";
import { hasUnconfirmedPrescription } from "../../lib/posPrescription";

export type PosCartItem = {
  product: PosProduct;
  quantity: number;
  stock: number;
  maxQuantity: number;
  prescriptionConfirmed: boolean;
  prescriptionRetained: boolean;
};

type Props = {
  cart: PosCartItem[];
  units: number;
  total: number;
  hasOpenCash: boolean;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onUpdatePrescription: (
    productId: string,
    field: "prescriptionConfirmed" | "prescriptionRetained",
    value: boolean,
  ) => void;
  onRemoveItem: (productId: string) => void;
  onOpenCheckout: () => void;
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export const PosCartTable = ({
  cart,
  units,
  total,
  hasOpenCash,
  onUpdateQuantity,
  onUpdatePrescription,
  onRemoveItem,
  onOpenCheckout,
}: Props) => (
  <aside
    className={`pos-v2__cart ${
      cart.some((item) => item.product.prescriptionType === "RETAINED")
        ? "pos-v2__cart--retained"
        : ""
    }`}
  >
    <div className="pos-v2__cart-header">
      <div>
        <span className="pos-v2__eyebrow">Venta actual</span>
        <h2>Resumen</h2>
      </div>
      <div className="pos-v2__cart-count">
        <ShoppingCart size={16} />
        <span>{units}</span>
      </div>
    </div>
    <div className="pos-v2__cart-items">
      {cart.length ? (
        cart.map((item) => (
          <div
            className={`pos-cart-item ${
              item.product.prescriptionType === "RETAINED"
                ? "pos-cart-item--retained"
                : ""
            }`}
            key={item.product.id}
          >
            <div className="pos-cart-item__main">
              <div className="pos-cart-item__icon">
                <Pill size={17} />
              </div>
              <div className="pos-cart-item__info">
                <strong>{item.product.name}</strong>
                <span>{clp.format(Number(item.product.salePrice))} c/u</span>
              </div>
              <button
                className="pos-cart-item__remove"
                onClick={() => onRemoveItem(item.product.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="pos-cart-item__bottom">
              <div className="pos-quantity">
                <button
                  onClick={() =>
                    onUpdateQuantity(item.product.id, item.quantity - 1)
                  }
                >
                  <Minus size={14} />
                </button>
                <strong>{item.quantity}</strong>
                <button
                  onClick={() =>
                    onUpdateQuantity(item.product.id, item.quantity + 1)
                  }
                >
                  <Plus size={14} />
                </button>
              </div>
              <strong>
                {clp.format(Number(item.product.salePrice) * item.quantity)}
              </strong>
            </div>
            {item.product.prescriptionType === "RETAINED" ? (
              <div className="pos-cart-item__warning" role="alert">
                <AlertTriangle size={17} />
                <div>
                  <strong>Receta retenida obligatoria</strong>
                  <span>
                    Solicita la receta original antes de cobrar. Debes
                    revisarla y conservarla en la farmacia.
                  </span>
                </div>
              </div>
            ) : null}
            {item.product.prescriptionType !== "NONE" ? (
              <label className="pos-cart-item__confirmation">
                <input
                  type="checkbox"
                  checked={item.prescriptionConfirmed}
                  onChange={(event) =>
                    onUpdatePrescription(
                      item.product.id,
                      "prescriptionConfirmed",
                      event.target.checked,
                    )
                  }
                />
                Confirmo que revisé la receta original
              </label>
            ) : null}
            {item.product.prescriptionType === "RETAINED" ? (
              <label className="pos-cart-item__confirmation">
                <input
                  type="checkbox"
                  checked={item.prescriptionRetained}
                  onChange={(event) =>
                    onUpdatePrescription(
                      item.product.id,
                      "prescriptionRetained",
                      event.target.checked,
                    )
                  }
                />
                Confirmo que retuve la receta en la farmacia
              </label>
            ) : null}
          </div>
        ))
      ) : (
        <div className="pos-v2__cart-empty">
          <div>
            <ShoppingCart size={26} />
          </div>
          <strong>Tu venta está vacía</strong>
          <span>Selecciona productos para comenzar.</span>
        </div>
      )}
    </div>

    <div className="pos-v2__cart-footer">
      {hasUnconfirmedPrescription(cart) ? (
        <p className="pos-v2__prescription-gate" role="status">
          Confirma la revisión de cada receta y, cuando corresponda, su
          retención para continuar.
        </p>
      ) : null}
      <div className="pos-v2__totals">
        <div>
          <span>Productos</span>
          <strong>{units}</strong>
        </div>
        <div className="pos-v2__total">
          <span>Total</span>
          <strong>{clp.format(total)}</strong>
        </div>
      </div>
      <button
        className="pos-v2__checkout"
        disabled={
          !cart.length || !hasOpenCash || hasUnconfirmedPrescription(cart)
        }
        onClick={onOpenCheckout}
      >
        <ReceiptText size={18} />
        <span>
          {!hasOpenCash
            ? "Abrir caja para cobrar"
            : hasUnconfirmedPrescription(cart)
              ? "Confirma la receta para continuar"
              : "Continuar al pago"}
        </span>
        <ChevronRight size={17} />
      </button>
    </div>
  </aside>
);
