export interface AdminSearchResults {
  orders: Array<{ orderNumber: string; status: string; href: string }>;
  products: Array<{
    id: string;
    name: string;
    status: string;
    /** The matching SKU when the search hit one. */
    sku: string | null;
    imageUrl: string | null;
    href: string;
  }>;
}
