import type { MetadataRoute } from "next";
import { APP_CONFIG } from "@/config/app";

/** Name and GP icon when the store is added to a phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_CONFIG.publicTitle,
    short_name: "Gamer Perú",
    description: APP_CONFIG.publicDescription,
    start_url: "/",
    display: "browser",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
