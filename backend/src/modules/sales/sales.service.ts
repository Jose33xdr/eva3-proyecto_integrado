import type { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../utils/ApiError.js";
import { getPagination, paginationMeta } from "../../utils/pagination.js";
import type {
  cancelSaleSchema,
  checkoutSchema,
  issueTaxDocumentSchema,
  salesQuerySchema,
} from "./sales.schemas.js";

type CheckoutInput = z.infer<typeof checkoutSchema>;
type SalesQuery = z.infer<typeof salesQuerySchema>;
type CancelSaleInput = z.infer<typeof cancelSaleSchema>;
type IssueTaxDocumentInput = z.infer<typeof issueTaxDocumentSchema>;

const roundMoney = (value: number) => Math.round(value);
const asNumber = (value: unknown) => Number(value ?? 0);

const saleInclude = {
  seller: {
    select: { id: true, firstName: true, lastName: true, username: true },
  },
  cashSession: {
    include: { cashRegister: true },
  },
  items: {
    include: {
      product: true,
      batchAllocations: {
        include: { batch: true },
      },
    },
  },
  payments: true,
  taxDocument: true,
} as const;

type FefoAllocation = {
  batchId: string;
  locationId: string;
  quantity: number;
  reservedQuantity: number;
  unitCost: number | null;
};

const allocateFefo = async (
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
  locationId?: string | null,
): Promise<FefoAllocation[]> => {
  const stocks = await tx.inventoryStock.findMany({
    where: {
      ...(locationId ? { locationId } : {}),
      quantity: { gt: 0 },
      location: { isActive: true, type: { not: "QUARANTINE" } },
      batch: {
        productId,
        isBlocked: false,
        expirationDate: { gt: new Date() },
      },
    },
    include: {
      batch: true,
    },
    orderBy: {
      batch: {
        expirationDate: "asc",
      },
    },
  });

  let remaining = quantity;
  const allocations: FefoAllocation[] = [];

  for (const stock of stocks) {
    if (remaining <= 0) break;

    const reservedQty = Number(stock.reservedQuantity);
    const available = Math.max(0, Number(stock.quantity) - reservedQty);

    if (available <= 0) continue;

    const allocated = Math.min(available, remaining);

    allocations.push({
      batchId: stock.batchId,
      locationId: stock.locationId,
      quantity: allocated,
      reservedQuantity: reservedQty,
      unitCost:
        stock.batch.purchasePrice === null
          ? null
          : Number(stock.batch.purchasePrice),
    });

    remaining -= allocated;
  }

  if (remaining > 0) {
    throw new ApiError(409, "Stock disponible insuficiente para completar la venta");
  }

  return allocations;
};

export const listSales = async (query: SalesQuery) => {
  const { page, limit, search, status, sellerId, cashSessionId, from, to } =
    query;
  const { skip, take } = getPagination(page, limit);

  const where = {
    ...(status ? { status } : {}),
    ...(sellerId ? { sellerId } : {}),
    ...(cashSessionId ? { cashSessionId } : {}),
    ...(from || to
      ? {
          saleDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" as const } },
            { customerRut: { contains: search, mode: "insensitive" as const } },
            { customerName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.sale.findMany({
      where,
      include: saleInclude,
      skip,
      take,
      orderBy: { saleDate: "desc" },
    }),
    prisma.sale.count({ where }),
  ]);

  return { items, meta: paginationMeta(page, limit, total) };
};

export const getSale = async (id: string) => {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: saleInclude,
  });

  if (!sale) throw new ApiError(404, "Venta no encontrada");
  return sale;
};

export const checkout = async (sellerId: string, input: CheckoutInput) => {
  if (
    input.taxDocumentType === "INVOICE" &&
    (!input.customerRut ||
      !input.customerBusinessName ||
      !input.customerBusinessActivity ||
      !input.customerAddress)
  ) {
    throw new ApiError(
      400,
      "Para factura se requieren RUT, razón social, giro y dirección",
    );
  }

  return prisma.$transaction(async (tx) => {
    const session = await tx.cashSession.findUnique({
      where: { id: input.cashSessionId },
    });

    if (!session || session.status !== "OPEN") {
      throw new ApiError(409, "Debe existir una sesión de caja abierta");
    }

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, isActive: true },
    });

    if (products.length !== productIds.length) {
      throw new ApiError(400, "Uno o más productos no existen o están inactivos");
    }

    const productMap = new Map(products.map((product) => [product.id, product]));

    type PreparedSaleItem = {
      productId: string;
      quantity: number;
      discountAmount: number;
      prescriptionConfirmed: boolean;
      prescriptionRetained: boolean;
      locationId?: string | null;
      product: {
        id: string;
        name: string;
        salePrice: unknown;
        prescriptionType: "NONE" | "SIMPLE" | "RETAINED";
      };
      unitPrice: number;
      lineGross: number;
      lineNet: number;
      lineTax: number;
      lineTotal: number;
    };

    const preparedItems: PreparedSaleItem[] = [];

    let subtotal = 0;
    let discountAmount = 0;
    let totalAmount = 0;
    let exactNetSum = 0;
    let exactTaxSum = 0;
    const divisor = 1 + input.taxRate / 100;

    for (const item of input.items) {
      const product = productMap.get(item.productId)!;

      const requiresPrescription = product.prescriptionType !== "NONE";
      const requiresRetention = product.prescriptionType === "RETAINED";

      if (requiresPrescription && !item.prescriptionConfirmed) {
        throw new ApiError(
          400,
          `Confirma que revisaste la receta de ${product.name}`,
        );
      }

      if (requiresRetention && !item.prescriptionRetained) {
        throw new ApiError(
          400,
          `Confirma que retuviste la receta de ${product.name}`,
        );
      }

      const unitPrice = asNumber(product.salePrice);
      const lineGross = roundMoney(unitPrice * item.quantity);

      if (item.discountAmount > lineGross) {
        throw new ApiError(
          400,
          `El descuento de ${product.name} supera el total de la línea`,
        );
      }

      const lineTotal = roundMoney(lineGross - item.discountAmount);
      const exactLineNet = lineTotal / divisor;
      const exactLineTax = lineTotal - exactLineNet;
      const lineNet = roundMoney(exactLineNet);
      const lineTax = roundMoney(lineTotal - lineNet);

      subtotal += lineGross;
      discountAmount += item.discountAmount;
      totalAmount += lineTotal;
      exactNetSum += exactLineNet;
      exactTaxSum += exactLineTax;

      preparedItems.push({
        ...item,
        product,
        unitPrice,
        lineGross,
        lineNet,
        lineTax,
        lineTotal,
      });
    }

    subtotal = roundMoney(subtotal);
    discountAmount = roundMoney(discountAmount);
    totalAmount = roundMoney(totalAmount);

    const netAmount = roundMoney(exactNetSum);
    const taxAmount =
      netAmount + roundMoney(exactTaxSum) === totalAmount
        ? roundMoney(exactTaxSum)
        : roundMoney(totalAmount - netAmount);

    const paymentsTotal = roundMoney(
      input.payments.reduce((sum, payment) => sum + payment.amount, 0),
    );

    if (paymentsTotal !== totalAmount) {
      throw new ApiError(
        400,
        `Los pagos (${paymentsTotal}) deben coincidir con el total de la venta (${totalAmount})`,
      );
    }

    const sale = await tx.sale.create({
      data: {
        code: input.code,
        status: "DRAFT",
        sellerId,
        cashSessionId: input.cashSessionId,
        customerRut: input.customerRut ?? null,
        customerName: input.customerName ?? null,
        customerBusinessName: input.customerBusinessName ?? null,
        customerBusinessActivity: input.customerBusinessActivity ?? null,
        customerAddress: input.customerAddress ?? null,
        subtotal,
        discountAmount,
        netAmount,
        taxAmount,
        totalAmount,
        notes: input.notes ?? null,
      },
    });

    for (const item of preparedItems) {
      const allocations = await allocateFefo(
        tx,
        item.productId,
        item.quantity,
        item.locationId,
      );

      const saleItem = await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: item.productId,
          quantity: item.quantity,
          prescriptionType: item.product.prescriptionType,
          prescriptionConfirmed: item.prescriptionConfirmed,
          prescriptionRetained: item.prescriptionRetained,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          netAmount: item.lineNet,
          taxAmount: item.lineTax,
          totalAmount: item.lineTotal,
        },
      });

      const batchTotals = new Map<string, number>();

      for (const allocation of allocations) {
        const updatedStock = await tx.inventoryStock.updateMany({
          where: {
            batchId: allocation.batchId,
            locationId: allocation.locationId,
            quantity: {
              gte: allocation.quantity + allocation.reservedQuantity,
            },
          },
          data: {
            quantity: { decrement: allocation.quantity },
          },
        });

        if (updatedStock.count === 0) {
          throw new ApiError(
            409,
            "Conflicto de concurrencia: el stock del lote fue consumido por otra transacción simultánea.",
          );
        }

        const postStock = await tx.inventoryStock.findUnique({
          where: {
            batchId_locationId: {
              batchId: allocation.batchId,
              locationId: allocation.locationId,
            },
          },
        });

        if (!postStock || postStock.quantity - postStock.reservedQuantity < 0) {
          throw new ApiError(
            409,
            "Stock disponible insuficiente considerando unidades reservadas.",
          );
        }

        await tx.inventoryMovement.create({
          data: {
            type: "SALE",
            productId: item.productId,
            batchId: allocation.batchId,
            originLocationId: allocation.locationId,
            quantity: allocation.quantity,
            unitCost: allocation.unitCost,
            referenceType: "SALE",
            referenceId: sale.id,
            reason: `Venta ${input.code}`,
            userId: sellerId,
          },
        });

        batchTotals.set(
          allocation.batchId,
          (batchTotals.get(allocation.batchId) ?? 0) + allocation.quantity,
        );
      }

      for (const [batchId, quantity] of batchTotals.entries()) {
        await tx.saleItemBatch.create({
          data: {
            saleItemId: saleItem.id,
            batchId,
            quantity,
          },
        });
      }
    }

    for (const payment of input.payments) {
      await tx.payment.create({
        data: {
          saleId: sale.id,
          method: payment.method,
          amount: payment.amount,
          referenceCode: payment.referenceCode ?? null,
        },
      });
    }

    const cashPaid = roundMoney(
      input.payments
        .filter((payment) => payment.method === "CASH")
        .reduce((sum, payment) => sum + payment.amount, 0),
    );

    if (cashPaid > 0) {
      await tx.cashMovement.create({
        data: {
          cashSessionId: input.cashSessionId,
          type: "SALE",
          amount: cashPaid,
          description: `Venta ${input.code}`,
          saleId: sale.id,
          userId: sellerId,
        },
      });
    }

    await tx.taxDocument.create({
      data: {
        saleId: sale.id,
        type: input.taxDocumentType,
        status: "PENDING",
      },
    });

    await tx.sale.update({
      where: { id: sale.id },
      data: { status: "COMPLETED" },
    });

    return tx.sale.findUnique({
      where: { id: sale.id },
      include: saleInclude,
    });
  });
};

export const cancelSale = async (
  saleId: string,
  userId: string,
  input: CancelSaleInput,
) => {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: saleInclude,
    });

    if (!sale) throw new ApiError(404, "Venta no encontrada");

    const updatedSale = await tx.sale.updateMany({
      where: { id: saleId, status: "COMPLETED" },
      data: {
        status: "CANCELLED",
        notes: sale.notes
          ? `${sale.notes}\nANULACIÓN: ${input.reason}`
          : `ANULACIÓN: ${input.reason}`,
      },
    });

    if (updatedSale.count === 0) {
      throw new ApiError(409, "Solo se pueden anular ventas completadas");
    }

    const cashPaid = roundMoney(
      sale.payments
        .filter((payment) => payment.method === "CASH")
        .reduce((sum, payment) => sum + asNumber(payment.amount), 0),
    );

    if (cashPaid > 0) {
      if (!sale.cashSession || sale.cashSession.status === "CLOSED" || sale.cashSession.status !== "OPEN") {
        throw new ApiError(
          409,
          "No se puede anular una venta con pago en efectivo porque la sesión de caja asociada está cerrada",
        );
      }
    }

    const saleMovements = await tx.inventoryMovement.findMany({
      where: {
        type: "SALE",
        referenceType: "SALE",
        referenceId: saleId,
      },
    });

    for (const movement of saleMovements) {
      if (!movement.originLocationId) continue;

      await tx.inventoryStock.upsert({
        where: {
          batchId_locationId: {
            batchId: movement.batchId,
            locationId: movement.originLocationId,
          },
        },
        update: {
          quantity: { increment: movement.quantity },
        },
        create: {
          batchId: movement.batchId,
          locationId: movement.originLocationId,
          quantity: movement.quantity,
          reservedQuantity: 0,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          type: "CUSTOMER_RETURN",
          productId: movement.productId,
          batchId: movement.batchId,
          destinationLocationId: movement.originLocationId,
          quantity: movement.quantity,
          unitCost: movement.unitCost,
          referenceType: "SALE_CANCELLATION",
          referenceId: saleId,
          reason: input.reason,
          userId,
        },
      });
    }

    if (cashPaid > 0 && sale.cashSessionId) {
      await tx.cashMovement.create({
        data: {
          cashSessionId: sale.cashSessionId,
          type: "REFUND",
          amount: cashPaid,
          description: `Anulación venta ${sale.code}: ${input.reason}`,
          saleId,
          userId,
        },
      });
    }

    if (sale.taxDocument) {
      await tx.taxDocument.update({
        where: { saleId },
        data: {
          status: "CANCELLED",
          siiResponse: `Documento anulado localmente: ${input.reason}`,
        },
      });
    }

    return tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: saleInclude,
    });
  });
};

export const issueTaxDocumentMock = async (
  saleId: string,
  input: IssueTaxDocumentInput,
) => {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { taxDocument: true },
  });

  if (!sale) throw new ApiError(404, "Venta no encontrada");
  if (sale.status !== "COMPLETED") {
    throw new ApiError(409, "La venta debe estar completada");
  }
  if (!sale.taxDocument) {
    throw new ApiError(404, "La venta no tiene documento tributario");
  }
  if (sale.taxDocument.status === "CANCELLED") {
    throw new ApiError(409, "El documento está anulado");
  }

  const folio =
    input.folio ??
    `MOCK-${Date.now().toString().slice(-10)}`;

  return prisma.taxDocument.update({
    where: { saleId },
    data: {
      status: "ISSUED",
      folio,
      siiTrackId: `LOCAL-${sale.id.slice(0, 8).toUpperCase()}`,
      siiResponse:
        "Emisión simulada para ambiente académico. Integración SII real pendiente.",
      issuedAt: new Date(),
    },
  });
};
