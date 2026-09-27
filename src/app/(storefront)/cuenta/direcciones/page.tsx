import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomerAddresses } from "@/lib/account/addresses";
import { AddressList } from "@/components/account/address-list";
import { AddressErrorState } from "@/components/account/address-error-state";

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

  if (addressesState.status === "ERROR") {
    return <AddressErrorState />;
  }

  return (
    <AddressList
      addresses={addressesState.addresses}
      defaultShippingAddressId={addressesState.defaultShippingAddressId}
    />
  );
}
