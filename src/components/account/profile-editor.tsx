"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { ProfileFormDTO } from "@/lib/account/types";
import { ProfileForm } from "./profile-form";
import { useAccountCardClose } from "./account-card";

/** The profile form inside its card: a save refreshes the summary and folds the card back. */
export function ProfileEditor({ initialProfile }: { initialProfile: ProfileFormDTO }) {
  const router = useRouter();
  const close = useAccountCardClose();

  return (
    <ProfileForm
      initialProfile={initialProfile}
      onSaved={() => {
        router.refresh();
        close();
      }}
    />
  );
}
