import { expect, it } from "vitest";
import {
  parseJinmsProduct,
  parseMemoryProduct,
  sourcePrice,
  sourceProductLinks,
  enrichAttackProduct,
} from "../../scripts/catalog/source-catalog.mjs";

it("no inventa moneda, precios o existencias de JINMS", () => {
  expect(sourcePrice("63.38", "PEN")).toEqual({ currency: "PEN", cents: 6338 });
  expect(sourcePrice("10", undefined)).toBeNull();
  expect(sourcePrice("-1", "USD")).toBeNull();
  const product = parseJinmsProduct(
    '<script type="application/ld+json">[{"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Keyboard"}]},{"@type":"Product","image":["https://example.com/keyboard.jpg"]}]</script><h1>Jinms F75</h1><div productdesc="1"><p>Polling Rate: 8000Hz<br>Weight: 700g</p></div>',
    "https://www.jinms.com/jinms-f75/"
  );
  expect(product).toMatchObject({
    category: "teclados",
    name: "Jinms F75",
    stock: 0,
    variants: [{ price: null }],
  });
  expect(product.specifications).toEqual(
    expect.arrayContaining([expect.objectContaining({ label: "Polling rate", value: "8000Hz" })])
  );
});

it("separa especificaciones, precio PEN y galería del monitor de los productos relacionados", () => {
  const product = parseMemoryProduct(
    '<script type="application/ld+json">{"@type":"Product","name":"MONITOR 27 ASUS Modelo","mpn":"VG27","image":"https://cdn.memorykings.pe/files/1/123-A.jpg","offers":{"price":"1,099.50","priceCurrency":"PEN"},"aggregateRating":{"ratingValue":"5","reviewCount":"999"}}</script><div class="especificaciones-content"><div><strong>Resolución</strong></div><div>2560 × 1440</div><div><strong>Conectores</strong></div><div>HDMI</div><div>DisplayPort</div></div><img src="https://cdn.memorykings.pe/files/1/123-B.jpg"><img src="https://cdn.memorykings.pe/files/1/999-A.jpg">',
    "https://www.memorykings.pe/producto/123/monitor-asus"
  );
  expect(product.name).toBe("ASUS VG27");
  expect(product.variants[0]?.price).toEqual({ currency: "PEN", cents: 109950 });
  expect(product.specifications).toEqual([
    { label: "Resolución", value: "2560 × 1440" },
    { label: "Conectores", value: "HDMI / DisplayPort" },
  ]);
  expect(product.images).toHaveLength(2);
  expect(product).not.toHaveProperty("aggregateRating");
  expect(product.stock).toBe(0);
});

it("deduplica enlaces y solo sigue productos del mismo sitio", () => {
  expect(
    sourceProductLinks(
      '<a href="/producto/123/modelo">A</a><a href="/producto/123/modelo">B</a><a href="https://otro.example/producto/1/modelo">C</a>',
      "https://www.memorykings.pe",
      /^\/producto\//
    )
  ).toEqual(["https://www.memorykings.pe/producto/123/modelo"]);
});

it("extrae varias especificaciones dentro de un párrafo sin mezclarlas", () => {
  const product = parseMemoryProduct(
    '<h1>MONITOR 27 SAMSUNG Modelo</h1><div class="especificaciones-content"><p><strong>Panel</strong><br>IPS<br><strong>Resolución</strong><br>2560 × 1440<br><strong>Frecuencia</strong></p><p>300 Hz</p></div>',
    "https://www.memorykings.pe/producto/456/modelo"
  );
  expect(product.specifications).toEqual([
    { label: "Panel", value: "IPS" },
    { label: "Resolución", value: "2560 × 1440" },
    { label: "Frecuencia", value: "300 Hz" },
  ]);
});

it("omite estilos y scripts del bloque técnico del fabricante", () => {
  const product = parseJinmsProduct("<h1>Modelo</h1>", "https://www.jinms.com/modelo/");
  const enriched = enrichAttackProduct(
    product,
    '<div class="product-info"><div class="prose"><style>.lighting { color: rgb(0,0,0); }</style><script>const wireless="irrelevant";</script><p>Sensor: PAW3311</p><p>RGB Lighting</p></div></div>'
  );
  expect(enriched.specifications).toEqual(
    expect.arrayContaining([expect.objectContaining({ label: "Sensor", value: "PAW3311" })])
  );
  expect(enriched.specifications.every((row) => !/color:|const wireless/.test(row.value))).toBe(
    true
  );
});
