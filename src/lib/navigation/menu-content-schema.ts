import { z } from "zod";
import { SafeString } from "@/lib/validation/safe-string";
import { NAVIGATION_CONFIG } from "@/components/navigation/navigation-data";

export const NavigationHrefSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => {
    if (/^\/(?!\/)[^\s\\]*$/.test(value)) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Usa una ruta de la tienda que empiece con / o un enlace HTTPS.");

export const MenuLinkSchema = z
  .object({
    id: z.string().uuid(),
    label: SafeString(1, 100),
    href: NavigationHrefSchema,
    sectionTitle: SafeString(1, 100),
    placement: z.enum(["section", "tile"]),
    icon: z.enum(["mouse", "keyboard", "usb", "cpu"]).nullable(),
    isVisible: z.boolean(),
  })
  .strict();
export type EditableMenuLink = z.infer<typeof MenuLinkSchema>;
export const MenuContentSchema = z
  .object({
    entryId: z.string().max(64),
    label: SafeString(1, 100),
    href: NavigationHrefSchema,
    links: z
      .array(MenuLinkSchema)
      .max(32)
      .refine(
        (links) => new Set(links.map((link) => link.id)).size === links.length,
        "No repitas enlaces."
      ),
  })
  .strict();
export type EditableMenuContent = z.infer<typeof MenuContentSchema>;

/** Stable default IDs allow opening an editor repeatedly before its first save. */
export function defaultMenuContent(entryId: string): EditableMenuContent {
  const entry = NAVIGATION_CONFIG.primaryNav.find((entry) => entry.id === entryId);
  let index = 0;
  const id = () =>
    `01a1c000-0000-7000-8000-${String(NAVIGATION_CONFIG.primaryNav.findIndex((item) => item.id === entryId) * 100 + ++index).padStart(12, "0")}`;
  return {
    entryId,
    label: entry?.label ?? entryId,
    href: entry?.href ?? "/",
    links: [
      ...(entry?.sections ?? []).flatMap((section) =>
        section.items.map((item) => ({
          id: id(),
          label: item.label,
          href: item.href,
          sectionTitle: section.title,
          placement: "section" as const,
          icon: null,
          isVisible: true,
        }))
      ),
      ...(entry?.tiles ?? []).map((tile) => ({
        id: id(),
        label: tile.title,
        href: tile.href,
        sectionTitle: "Accesos",
        placement: "tile" as const,
        icon: tile.icon ?? null,
        isVisible: true,
      })),
    ],
  };
}
