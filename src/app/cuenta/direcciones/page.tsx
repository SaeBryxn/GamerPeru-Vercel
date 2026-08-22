import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomerAddresses } from "@/lib/account/addresses";
import { AddressList } from "@/components/account/address-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Direcciones | Mi cuenta | Gamer Perú",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DireccionesPage() {
  const addressesState = await getCurrentCustomerAddresses();

  if (addressesState.status === "UNAUTHENTICATED") {
    redirect("/auth/login");
  }

  if (addressesState.status === "NEEDS_PROFILE_COMPLETION") {
    redirect("/auth/completar-perfil");
  }

  const addresses = addressesState.status === "READY" ? addressesState.addresses : [];
  const defaultShippingAddressId =
    addressesState.status === "READY" ? addressesState.defaultShippingAddressId : null;

  return <AddressList addresses={addresses} defaultShippingAddressId={defaultShippingAddressId} />;
}
