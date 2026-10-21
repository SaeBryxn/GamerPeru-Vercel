"use client";

import dynamic from "next/dynamic";
import ProductEditorLoading from "./loading";

// The editor is interactive only. Rendering its HTML on the server costs Worker CPU (Error 1102)
// and gives nothing to an authenticated admin page, so it renders in the browser.
export const ProductEditor = dynamic(
  () => import("./product-editor").then((module) => module.ProductEditor),
  { ssr: false, loading: () => <ProductEditorLoading /> }
);
