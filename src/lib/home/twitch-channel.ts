/** Accept a channel name or its public Twitch URL; never preserve arbitrary iframe URLs. */
export function normalizeTwitchChannel(value: string): string | null {
  let channel = value.trim().replace(/^@/, "");
  if (!channel) return "";
  if (/^https?:/i.test(channel)) {
    try {
      const url = new URL(channel);
      if (
        url.protocol !== "https:" ||
        !["twitch.tv", "www.twitch.tv"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.port
      )
        return null;
      channel = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }
  return /^[a-z0-9_]{4,25}$/i.test(channel) &&
    !["directory", "downloads", "settings", "videos"].includes(channel.toLowerCase())
    ? channel.toLowerCase()
    : null;
}
