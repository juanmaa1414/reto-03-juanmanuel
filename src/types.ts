/**
 * Domain types for the purchase order process.
 * Source: PRD sections 7.1, 7.2 and 7.4.
 *
 * JSON field names stay in Spanish because they are the wire contract defined
 * by the challenge; identifiers, comments and file names are in English.
 */

export type Email = {
  id: string;
  de: string;
  para?: string;
  asunto: string;
  fecha: string;
  cuerpo?: string;
  adjuntos?: string[];
};

export type PurchaseRequest = {
  solicitud_id: string;
  solicitante: string;
  proveedor_nombre: string;
  proveedor_nit?: string;
  descripcion: string;
  centro_costo: string;
  subarea: string;
  cantidad: number;
  valor_unitario: number;
  valor_total: number;
  moneda: string;
  indicador_iva?: string;
  condiciones_pago?: string;
  fecha_solicitud: string;
};

export type Quote = {
  proveedor: string;
  nit: string | null;
  total: number;
  moneda: string;
  validez_hasta: string | null;
  texto: string;
  /** Quote number or reference, when the document includes one. */
  referencia: string | null;
};

export type Approval = {
  de: string;
  para?: string;
  fecha: string;
  asunto?: string;
  aprobado: boolean;
  texto: string;
};

export type Invoice = {
  numero: string;
  fecha: string;
  total: number;
};

export type PackageData = {
  correo: Email;
  solicitud: PurchaseRequest;
  cotizacion: Quote | null;
  aprobacion: Approval | null;
  factura: Invoice | null;
};

export type Reference = {
  solicitud_id: string;
  correo_id: string;
  cotizacion_ref: string | null;
};

export type Supplier = {
  codigo_sap: string;
  nit: string;
  nombre: string;
};

export type Approver = {
  email: string;
  fecha_aprobacion: string;
  evidencia_sha256: string;
};

export type LineItem = {
  numero: number;
  descripcion: string;
  cantidad: number;
  unidad: "UN" | "H" | "MES";
  precio_unitario: number;
  centro_costo: string;
  subarea: string;
  indicador_iva: string;
};

export type ExceptionItem = {
  codigo: string;
  detalle: string;
  confirmado_por: string | null;
};

export type PurchaseOrder = {
  referencia: Reference;
  sociedad: "1000";
  organizacion_compras: "1000";
  proveedor: Supplier;
  moneda: "COP" | "USD";
  condiciones_pago: string;
  aprobador: Approver;
  posiciones: LineItem[];
  excepciones: ExceptionItem[];
};

/** Values completed automatically from master data. */
export type DerivedValues = {
  condiciones_pago?: string;
  indicador_iva?: string;
  proveedor_codigo_sap?: string;
  proveedor_nit?: string;
  proveedor_nombre?: string;
  [key: string]: string | undefined;
};

export type ValidationResult = {
  apta: boolean;
  bloqueos: string[];
  confirmaciones: string[];
  derivados: DerivedValues;
  retroactiva: boolean;
};

/** Master data read from fixtures/reto-03/maestros/. */
export type SupplierMaster = {
  codigo_sap: string;
  nit: string;
  nombre: string;
  condiciones_pago_default: string;
  indicador_iva_default: string;
  activo: boolean;
};

export type ApproverMaster = {
  email: string;
  nombre?: string;
  tope: number;
};

export type CostCenterMaster = {
  centro_costo: string;
  nombre?: string;
  subareas: string[];
  aprobadores: ApproverMaster[];
};

export type TaxIndicatorMaster = {
  codigo: string;
  descripcion: string;
  tasa: number;
};

export type PaymentTermMaster = {
  codigo: string;
  descripcion: string;
  dias: number;
};

export type MasterData = {
  suppliers: SupplierMaster[];
  costCenters: CostCenterMaster[];
  taxIndicators: TaxIndicatorMaster[];
  paymentTerms: PaymentTermMaster[];
};

// Aliases kept for compatibility with the OpenSpec/PRD vocabulary.
export type Paquete = PackageData;
export type Solicitud = PurchaseRequest;
export type Correo = Email;
export type Cotizacion = Quote;
export type Aprobacion = Approval;
export type Factura = Invoice;
export type OrdenCompra = PurchaseOrder;
export type Referencia = Reference;
export type Proveedor = Supplier;
export type Aprobador = Approver;
export type Posicion = LineItem;
export type Excepcion = ExceptionItem;
export type Derivados = DerivedValues;
export type ResultadoValidacion = ValidationResult;
export type Maestros = MasterData;
export type ProveedorMaestro = SupplierMaster;
export type AprobadorMaestro = ApproverMaster;
export type CentroCostoMaestro = CostCenterMaster;
export type IndicadorIvaMaestro = TaxIndicatorMaster;
export type CondicionPagoMaestro = PaymentTermMaster;
