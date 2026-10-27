export interface AdminSearchResults {
  orders: Array<{ orderNumber: string; status: string; href: string }>;
  products: Array<{
    id: string;
    name: string;
    status: string;
    /** The matching SKU when the hit came from a SKU rather than the name. */
    sku: string | null;
    imageUrl: string | null;
    href: string;
  }>;
}
