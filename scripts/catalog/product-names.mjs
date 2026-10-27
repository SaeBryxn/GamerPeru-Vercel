/** Remove supplier marketing phrases from titles, never from descriptions or specifications. */
export function compactProductName(name, category) {
  let title = name
    .replace(/\bwith\s+Magnetic\s+Charging\s+Dock\b/gi, " ")
    .replace(
      /\b(?:Ultra[-\s]+Lightweight|High[-\s]+Performance|Pro[-\s]+Performance|All[-\s]+round|Superlight|Ultralight|Lightweight|Ergonomic|eSports?|Gaming|Wireless|Series|Tri[-\s]+Mode)\b/gi,
      " "
    );
  if (category === "mouses") {
    title = title
      .replace(/\b(?:Hollow\s+)?Carbon\s+Fiber(?:\s+Composite)?\b/gi, " ")
      .replace(/\bMagnesium\s+Alloy\b/gi, " ")
      .replace(/\b(?:Mouse|Mice)\b/gi, " ");
  } else if (category === "teclados") {
    title = title
      .replace(
        /\b(?:Hall\s+Effect|Magnetic\s+Switch(?:es)?|Gasket\s+(?:Mount|Structure)|Low[-\s]+Profile)\b/gi,
        " "
      )
      .replace(
        /\b(?:(?:Full|Semi)[-\s]+Aluminum|Aluminum|Mechanical|Magnetic|Custom|Keyboards?)\b/gi,
        " "
      );
  } else if (category === "mousepads") {
    title = title.replace(/\bMouse\s*Pads?\b/gi, " ").replace(/\bAnime\s*[-–—]\s*/gi, " ");
  } else if (category === "audio") {
    title = title.replace(/\b(?:In[-\s]+ear\s+)?(?:Headsets?|Headphones?|Earphones?)\b/gi, " ");
  }
  title = title
    .replace(/\s+/g, " ")
    .replace(/\s*[:–—-]\s*$/, "")
    .trim();
  // A descriptive title may be the only identifier. Never leave an empty title or just a brand.
  return title.split(/\s+/).length >= 2 ? title : name;
}

/** Keep meaningful differences when two separate records would otherwise have the same name. */
export function planProductNames(products) {
  const rows = products.map((product) => ({
    ...product,
    nextName: compactProductName(product.name, product.category_slug),
  }));
  const collisions = () => {
    const groups = new Map();
    for (const row of rows) {
      const key = row.nextName.toLocaleLowerCase("es");
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.values()].filter((group) => group.length > 1);
  };
  for (const group of collisions()) {
    for (const row of group.filter((row) => !row.imported)) row.nextName = row.name;
  }
  for (const group of collisions()) {
    for (const row of group) row.nextName = row.name;
  }
  return rows.filter((row) => row.nextName !== row.name);
}
