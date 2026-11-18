import { Barcode, Boxes, Plus, RefreshCcw, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ActionModal, type ActionField } from "../components/ui/ActionModal";
import { PageLoader } from "../components/feedback/PageLoader";
import { PageHeader } from "../components/ui/PageHeader";
import { ResponsiveTable } from "../components/ui/ResponsiveTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useResource } from "../hooks/useResource";
import { api, getApiErrorMessage } from "../lib/api";
import { nullable, numeric, runApiAction } from "../lib/actionHelpers";
import { categoryFields } from "../lib/catalogFields";
import { translateChoiceLabel } from "../lib/choiceLabels";
import type { FormValuesMap } from "../lib/formValidation";
import { notify } from "../lib/notify";

type Basic = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
};

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description?: string | null;
  productType: string;
  prescriptionType: string;
  isCenabast: boolean;
  concentration?: string | null;
  pharmaceuticalForm?: string | null;
  presentation?: string | null;
  purchasePrice?: number | string | null;
  salePrice: number | string;
  minimumStock: number;
  categoryId?: string;
  isActive: boolean;
  category: Basic;
};

type FormValues = Record<string, string | number | boolean>;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const normalize = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const productTypeHelp: Record<string, string> = {
  MEDICINE:
    "Remedios: comprimidos, cápsulas, jarabes, gotas, cremas o inyectables. Al guardar, indica si se vende sin receta, con receta simple o con receta retenida.",
  MEDICAL_DEVICE:
    "Artículos de uso médico que no son remedios: termómetros, tensiómetros, jeringas, gasas, vendas, test de embarazo.",
  HYGIENE: "Higiene diaria: pasta de dientes, jabón, toallas higiénicas, pañales.",
  PERSONAL_CARE: "Cuidado personal: shampoo, desodorante, cremas corporales, maquillaje.",
  SUPPLEMENT: "Vitaminas, minerales, proteínas y otros suplementos alimenticios.",
  DERMOCOSMETIC:
    "Cremas, limpiadores y protectores solares de línea dermatológica, pensados para el cuidado de la piel.",
  OTHER: "Cualquier producto que no calce en los tipos anteriores, como snacks o accesorios.",
};

const prescriptionTypeHelp: Record<string, string> = {
  SIMPLE: "Receta simple: el cliente muestra la receta y se la lleva de vuelta.",
  RETAINED: "Receta retenida: la farmacia se queda con la receta original al vender.",
};

/** Los datos de medicamento solo se muestran si corresponden o si el producto ya los tiene guardados. */
const showsMedicineData = (v: FormValuesMap) =>
  v.productType === "MEDICINE" ||
  Boolean(
    v.isCenabast ||
      String(v.concentration ?? "").trim() ||
      String(v.pharmaceuticalForm ?? "").trim(),
  );

const MEDICINE_GROUP = "Datos de medicamento";
const MEDICINE_GROUP_DESCRIPTION =
  "Solo para medicamentos. Casi todo se lee en el envase. Si un dato no aparece o tienes dudas, confírmalo con el químico farmacéutico antes de guardar: no lo completes por suposición.";

const defaultProductInitialValues = {
  productType: "MEDICINE",
  prescriptionType: "NONE",
  minimumStock: 0,
  salePrice: "",
  isActive: true,
  isCenabast: false,
};

export const ProductsPage = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("products.create");
  const canUpdate = hasPermission("products.update");
  const canDelete = hasPermission("products.delete");

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [productOpen, setProductOpen] = useState(false);
  const [quickCreate, setQuickCreate] = useState<"category" | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [quickError, setQuickError] = useState("");
  const [productPatch, setProductPatch] = useState<{ nonce: number; values: FormValuesMap }>();

  const productSelector = useCallback(
    (p: { items: Product[] }) => p.items,
    [],
  );
  const basicSelector = useCallback((p: { items: Basic[] }) => p.items, []);

  const productsRes = useResource<Product[], { items: Product[] }>(
    "/products?limit=100",
    productSelector,
  );
  const categoriesRes = useResource<Basic[], { items: Basic[] }>(
    "/categories?limit=100",
    basicSelector,
  );
  const products = useMemo(() => productsRes.data ?? [], [productsRes.data]);
  const categories = useMemo(
    () => categoriesRes.data ?? [],
    [categoriesRes.data],
  );
  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive),
    [categories],
  );
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return products.filter((p) => {
      if (categoryFilter !== "ALL" && p.category?.id !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return normalize(
        [
          p.name,
          p.sku,
          p.barcode ?? "",
          p.category?.name ?? "",
        ].join(" "),
      ).includes(q);
    });
  }, [products, query, categoryFilter]);

  const productFields = useMemo<ActionField[]>(() => {
    const categoryOptions = activeCategories.map((v) => ({ value: v.id, label: v.name }));
    if (editing?.category && !categoryOptions.some((o) => o.value === editing.category.id)) {
      categoryOptions.push({ value: editing.category.id, label: `${editing.category.name} (inactiva)` });
    }
    return [
      {
        name: "name",
        label: "Nombre del producto",
        required: true,
        minLength: 2,
        maxLength: 180,
        group: "Lo básico",
        groupDescription:
          "Con estos datos ya puedes crear el producto. Todo se encuentra en el envase o lo define la farmacia.",
        example: "Paracetamol 500 mg comprimidos",
        placeholder: "Ej.: Paracetamol 500 mg comprimidos (de 2 a 180 car.)",
        hint: "Escríbelo como aparece en el frente del envase, con la dosis si la tiene.",
        help: "Es el nombre con el que se buscará el producto al vender. Cópialo del frente de la caja o etiqueta. En medicamentos, agrega la cantidad (por ejemplo 500 mg) y la forma (comprimidos, jarabe) para distinguirlo de otras versiones del mismo remedio.",
      },
      {
        name: "sku",
        label: "Código interno (SKU)",
        required: true,
        minLength: 2,
        maxLength: 60,
        example: "PARA-500-20",
        placeholder: "Ej.: PARA-500-20 (de 2 a 60 car.)",
        hint: "Código propio de la farmacia, distinto para cada producto.",
        help: "SKU significa «código de inventario». No viene impreso en el envase: lo define la farmacia. Si ya usan códigos (en el sistema anterior o en las planillas de compra), usa el mismo. Si no, arma uno corto con el nombre y la dosis. Dos productos no pueden tener el mismo código.",
      },
      {
        name: "barcode",
        label: "Código de barras",
        maxLength: 50,
        example: "7801234567890",
        placeholder: "Ej.: 7801234567890 (hasta 50 car.)",
        hint: "Los números bajo las barras del envase. Puedes usar el lector o escribirlos. Si no tiene, déjalo vacío.",
        help: "Permite encontrar el producto en caja escaneándolo. Suele tener 13 números y está impreso bajo las barras, en la parte de atrás o en la base del envase. Cada código de barras puede usarse en un solo producto.",
      },
      {
        name: "productType",
        label: "Tipo de producto",
        type: "select",
        required: true,
        hint: "Según lo que elijas, el formulario muestra u oculta los datos propios de medicamentos.",
        help: "Indica qué clase de producto es. Si dudas entre dos opciones, elige la más parecida: puedes cambiarla después.",
        optionHelp: productTypeHelp,
        options: [
          "MEDICINE",
          "MEDICAL_DEVICE",
          "HYGIENE",
          "PERSONAL_CARE",
          "SUPPLEMENT",
          "DERMOCOSMETIC",
          "OTHER",
        ].map((v) => ({ value: v, label: translateChoiceLabel(v) })),
      },
      {
        name: "categoryId",
        label: "Categoría",
        type: "select",
        required: true,
        hint: canCreate
          ? "Elige el grupo al que pertenece. Si no está en la lista, créalo con el botón de abajo."
          : "Elige el grupo al que pertenece. Si falta, pídele a un administrador que lo cree.",
        help: "La categoría agrupa productos parecidos para encontrarlos y filtrarlos más fácil, por ejemplo «Analgésicos», «Vitaminas» o «Higiene bucal». Elige la que mejor describa el producto.",
        emptyOptionsHint: "Aún no hay categorías registradas.",
        options: categoryOptions,
        addOption: canCreate
          ? { label: "Crear una categoría nueva", onClick: () => openQuickCreate("category") }
          : undefined,
      },
      {
        name: "salePrice",
        label: "Precio de venta (en pesos)",
        type: "number",
        min: 0,
        required: true,
        example: "2990",
        placeholder: "Ej.: 2990 (en pesos, sin puntos)",
        hint: "Precio final que paga el cliente. Solo números, sin puntos ni signo $.",
        help: "Es el valor que se cobrará en caja. Escribe 2990 en lugar de $2.990. Si no conoces el precio, consúltalo con la persona encargada antes de guardar: no pongas un valor provisorio.",
      },
      {
        name: "minimumStock",
        label: "Stock mínimo para avisar",
        type: "number",
        min: 0,
        integer: true,
        required: true,
        example: "10",
        placeholder: "Ej.: 10 (unidades de aviso)",
        hint: "Cuando queden esta cantidad de unidades o menos, el sistema avisará que hay que reponer. Deja 0 si no quieres aviso.",
        help: "No es la cantidad que tienes ahora. Las unidades disponibles se suman al registrar la llegada de una compra (módulo Compras) y se corrigen en Inventario. Aquí solo indicas desde cuántas unidades quieres recibir la alerta de «stock bajo».",
      },
      {
        name: "purchasePrice",
        label: "Precio de compra (costo)",
        type: "number",
        min: 0,
        advanced: true,
        group: "Precio y presentación",
        example: "1500",
        placeholder: "Ej.: 1500 (costo neto)",
        hint: "Cuánto le cuesta a la farmacia cada unidad. Está en la factura del proveedor. Si no lo sabes, déjalo vacío.",
      },
      {
        name: "presentation",
        label: "Presentación",
        maxLength: 150,
        advanced: true,
        group: "Precio y presentación",
        example: "Caja con 20 comprimidos",
        placeholder: "Ej.: Caja con 20 comprimidos (máx. 150 car.)",
        hint: "Cómo viene envasado y cuánto trae. Aparece en el frente del envase.",
      },
      {
        name: "description",
        label: "Descripción o notas",
        type: "textarea",
        advanced: true,
        group: "Precio y presentación",
        example: "Envase con tapa dosificadora",
        placeholder: "Ej.: Envase con tapa dosificadora (máx. 255 car.)",
        hint: "Información útil para el equipo al vender o reponer.",
      },
      {
        name: "concentration",
        label: "Concentración (cuánto remedio trae)",
        maxLength: 100,
        advanced: true,
        group: MEDICINE_GROUP,
        groupDescription: MEDICINE_GROUP_DESCRIPTION,
        showIf: showsMedicineData,
        example: "500 mg",
        placeholder: "Ej.: 500 mg o 10 mg/ml (máx. 100 car.)",
        hint: "Se lee en el frente del envase, junto al nombre. Cópialo tal cual.",
        help: "Indica cuánto principio activo (la sustancia que hace efecto) tiene cada unidad: un comprimido, una cápsula o cierta cantidad de líquido. Por ejemplo «500 mg» o «120 mg/5 ml». Si el envase no lo indica, déjalo vacío.",
      },
      {
        name: "pharmaceuticalForm",
        label: "Forma del medicamento",
        maxLength: 100,
        advanced: true,
        group: MEDICINE_GROUP,
        showIf: showsMedicineData,
        example: "Comprimidos",
        placeholder: "Ej.: Comprimidos, Jarabe o Gotas (máx. 100 car.)",
        hint: "Comprimidos, cápsulas, jarabe, gotas, crema, inyectable, etc. Aparece en el envase.",
        help: "En lenguaje técnico se llama «forma farmacéutica»: es la manera en que viene el medicamento. Escríbela como aparece en el envase.",
      },
      {
        name: "prescriptionType",
        label: "Condición de venta del medicamento",
        type: "select",
        group: MEDICINE_GROUP,
        required: true,
        showIf: (v) => v.productType === "MEDICINE",
        hint: "Selecciona la condición indicada en el envase antes de guardar el producto.",
        help: "Si tienes dudas sobre la condición de venta, confírmala con el químico farmacéutico.",
        optionHelp: prescriptionTypeHelp,
        options: [
          { value: "NONE", label: "Sin receta" },
          { value: "SIMPLE", label: "Con receta simple" },
          { value: "RETAINED", label: "Con receta retenida" },
        ],
      },
      {
        name: "isCenabast",
        label: "Producto Cenabast",
        type: "checkbox",
        advanced: true,
        group: MEDICINE_GROUP,
        showIf: showsMedicineData,
        hint: "Al marcarla, se aplicará el precio del convenio Cenabast cuando el cliente use esa cobertura.",
        help: "Márcala solo si este producto está sujeto a un precio máximo de compra establecido por la farmacia.",
      },
      {
        name: "isActive",
        label: "Disponible para la venta",
        type: "checkbox",
        advanced: true,
        group: "Estado",
        hint: "Si la desmarcas, el producto no se podrá vender, pero se conserva todo su historial.",
      },
    ];
  }, [activeCategories, canCreate, editing]);

  const openQuickCreate = (kind: "category") => {
    setQuickError("");
    setQuickCreate(kind);
  };

  const close = () => {
    setProductOpen(false);
    setEditing(null);
    setActionError("");
    setProductPatch(undefined);
  };

  const saveProduct = async (v: FormValues) => {
    const prescriptionType = String(v.prescriptionType || "NONE");
    const basePayload: Record<string, unknown> = {
      sku: String(v.sku).trim(),
      barcode: nullable(v.barcode),
      name: String(v.name).trim(),
      description: nullable(v.description),
      productType: String(v.productType || "MEDICINE"),
      prescriptionType,
      isCenabast: Boolean(v.isCenabast),
      concentration: nullable(v.concentration),
      pharmaceuticalForm: nullable(v.pharmaceuticalForm),
      presentation: nullable(v.presentation),
      purchasePrice: v.purchasePrice === "" ? null : numeric(v.purchasePrice),
      salePrice: numeric(v.salePrice),
      minimumStock: numeric(v.minimumStock),
      categoryId: String(v.categoryId),
      isActive: Boolean(v.isActive),
    };

    if (editing) {
      if (basePayload.categoryId === (editing.category?.id ?? editing.categoryId)) {
        delete basePayload.categoryId;
      }
    }

    const productName = String(basePayload.name);
    await runApiAction(
      () =>
        editing
          ? api.patch(`/products/${editing.id}`, basePayload)
          : api.post("/products", { ...basePayload, activeIngredients: [] }),
      setBusy,
      setActionError,
      async () => {
        await productsRes.reload();
        close();
      },
      editing
        ? `Listo: se guardaron los cambios de «${productName}».`
        : `Listo: «${productName}» se agregó al catálogo.`,
    );
  };

  const saveQuickCreate = async (v: FormValues) => {
    const kind = quickCreate;
    if (!kind) return;
    const payload = {
      code: String(v.code).trim(),
      name: String(v.name).trim(),
      description: nullable(v.description),
      isActive: true,
    };
    let createdId = "";
    await runApiAction(
      async () => {
        const { data } = await api.post<{ item?: { id: string } }>(
          "/categories",
          payload,
        );
        createdId = data.item?.id ?? "";
      },
      setBusy,
      setQuickError,
      async () => {
        await categoriesRes.reload();
        if (createdId && productOpen) {
          // Deja seleccionada la opción recién creada en el formulario del producto.
          setProductPatch((current) => ({
            nonce: (current?.nonce ?? 0) + 1,
            values: { categoryId: createdId },
          }));
        }
        setQuickCreate(null);
      },
      `Listo: se creó la categoría «${payload.name}».`,
    );
  };

  const deleteProduct = async (product: Product) => {
    if (
      !window.confirm(
        `¿Eliminar «${product.name}» del catálogo?\n\nSolo se puede eliminar si no tiene lotes, compras ni ventas. Si los tiene, mejor edítalo y desmarca «Disponible para la venta».`,
      )
    ) {
      return;
    }
    setActionError("");
    try {
      await api.delete(`/products/${product.id}`);
      await productsRes.reload();
      notify(`Listo: «${product.name}» se eliminó del catálogo.`);
    } catch (error: unknown) {
      setActionError(getApiErrorMessage(error));
    }
  };

  const initial = useMemo(
    () =>
      editing
        ? {
            ...editing,
            categoryId: editing.category?.id ?? editing.categoryId ?? "",
            purchasePrice: editing.purchasePrice ?? "",
            prescriptionType:
              editing.prescriptionType || "NONE",
          }
        : defaultProductInitialValues,
    [editing],
  );

  const combinedError =
    productsRes.error ||
    categoriesRes.error ||
    (productOpen ? "" : actionError);

  return (
    <div className="module-v2">
      <PageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Medicamentos, dispositivos e insumos comercializados."
        actions={
          <div className="module-toolbar-actions">
            <button
              className="button button--secondary"
              onClick={() => void productsRes.reload()}
            >
              <RefreshCcw size={17} />
              Actualizar
            </button>
            {canCreate ? (
              <>
                <button
                  className="button button--secondary"
                  onClick={() => openQuickCreate("category")}
                  title="Crear un grupo para ordenar productos parecidos"
                >
                  <Plus size={17} />
                  Nueva categoría
                </button>
                <button
                  className="button button--primary"
                  onClick={() => {
                    setEditing(null);
                    setActionError("");
                    setProductOpen(true);
                  }}
                >
                  <Plus size={17} />
                  Nuevo producto
                </button>
              </>
            ) : null}
          </div>
        }
      />
      {productsRes.loading ? <PageLoader /> : null}
      {combinedError ? (
        <div className="alert alert--error">{combinedError}</div>
      ) : null}
      {!productsRes.loading ? (
        <>
          <section className="module-v2__kpis">
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--green">
                <Boxes size={19} />
              </span>
              <div>
                <span>Productos</span>
                <strong>{products.length}</strong>
                <small>Catálogo total</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--blue">
                <Boxes size={19} />
              </span>
              <div>
                <span>Activos</span>
                <strong>{products.filter((p) => p.isActive).length}</strong>
                <small>Disponibles</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--amber">
                <Boxes size={19} />
              </span>
              <div>
                <span>Con receta</span>
                <strong>
                  {products.filter((p) => p.prescriptionType !== "NONE").length}
                </strong>
                <small>Prescripción</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--danger">
                <Boxes size={19} />
              </span>
              <div>
                <span>Receta retenida</span>
                <strong>{products.filter((p) => p.prescriptionType === "RETAINED").length}</strong>
                <small>Retención requerida</small>
              </div>
            </article>
          </section>
          <section className="module-panel">
            <div className="module-panel__header module-panel__header--filters">
              <div>
                <span className="module-panel__eyebrow">Catálogo</span>
                <h2>Productos registrados</h2>
              </div>
              <div className="module-filters module-filters--wide">
                <label className="module-search">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Busca por nombre, código o código de barras..."
                    aria-label="Buscar productos"
                  />
                  <Barcode size={16} />
                </label>
                <select
                  className="module-select"
                  aria-label="Filtrar por categoría"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="ALL">Todas las categorías</option>
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {filtered.length ? (
              <ResponsiveTable
                rows={filtered}
                getKey={(r) => r.id}
                columns={[
                  {
                    key: "product",
                    header: "Producto",
                    render: (r) => (
                      <div className="cell-stack">
                        <strong>{r.name}</strong>
                        <span>{r.sku}</span>
                      </div>
                    ),
                  },
                  {
                    key: "category",
                    header: "Categoría",
                    render: (r) => r.category?.name ?? "—",
                  },
                  {
                    key: "price",
                    header: "Precio",
                    render: (r) => clp.format(Number(r.salePrice)),
                  },
                  {
                    key: "status",
                    header: "Estado",
                    render: (r) => (
                      <StatusBadge value={r.isActive ? "ACTIVE" : "INACTIVE"} />
                    ),
                  },
                  {
                    key: "actions",
                    header: "Acciones",
                    render: (r) =>
                      canUpdate || canDelete ? (
                        <div className="row-actions">
                          {canUpdate ? (
                            <button
                              className="row-action"
                              onClick={() => {
                                setEditing(r);
                                setActionError("");
                                setProductOpen(true);
                              }}
                            >
                              Editar
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              className="row-action row-action--danger"
                              onClick={() => void deleteProduct(r)}
                            >
                              Eliminar
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span>—</span>
                      ),
                  },
                ]}
              />
            ) : (
              <div className="module-empty">
                <span className="module-empty__icon">
                  <Boxes size={27} />
                </span>
                <strong>
                  {products.length ? "Sin resultados" : "Catálogo vacío"}
                </strong>
                <p>
                  {products.length
                    ? "Ningún producto coincide con la búsqueda o la categoría elegida. Prueba con otra palabra o elige «Todas las categorías»."
                    : canCreate
                      ? "Presiona «Nuevo producto» para agregar el primero."
                      : "Todavía no hay productos registrados."}
                </p>
              </div>
            )}
          </section>
        </>
      ) : null}

      <ActionModal
        open={productOpen}
        title={editing ? `Editar producto: ${editing.name}` : "Nuevo producto"}
        description={
          editing
            ? "Estos son los datos actuales. Cambia solo lo que necesites y presiona «Guardar cambios»; lo demás se mantiene igual."
            : "Completa «Lo básico» para crear el producto. Lo demás es opcional y puedes agregarlo después en «Más detalles»."
        }
        confirmLabel={editing ? "Guardar cambios" : "Crear producto"}
        fields={productFields}
        initialValues={initial}
        advancedTitle="Más detalles (opcional)"
        advancedDescription="Costo, presentación, condición de receta y disponibilidad para la venta."
        advancedOpenByDefault={Boolean(editing)}
        fieldPatch={productPatch}
        busy={busy && !quickCreate}
        error={actionError}
        onClose={close}
        onSubmit={saveProduct}
      />
      <ActionModal
        open={quickCreate !== null}
        title="Nueva categoría"
        description={
          productOpen
            ? "Al guardar, quedará seleccionado en el producto que estás creando. Lo que ya escribiste no se pierde."
            : "Las categorías agrupan productos parecidos para encontrarlos y filtrarlos más fácil."
        }
        confirmLabel="Crear categoría"
        fields={categoryFields}
        busy={busy}
        error={quickError}
        onClose={() => {
          setQuickCreate(null);
          setQuickError("");
        }}
        onSubmit={saveQuickCreate}
      />
    </div>
  );
};
