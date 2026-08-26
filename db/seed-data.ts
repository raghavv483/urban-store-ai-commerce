export const MERCHANT_SLUG = "urban-store";
export const MERCHANT_NAME = "Urban Store";

export type SeedProduct = {
  slug: string;
  name: string;
  category: string;
  priceInPaise: number;
  stock: number;
  sku: string;
  description: string;
  specifications: Record<string, string>;
};

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    slug: "thinkpad-x",
    name: "ThinkPad X",
    category: "Laptops",
    priceInPaise: 7_499_900,
    stock: 12,
    sku: "US-LAP-TPX",
    description:
      "A 14-inch business laptop built for long days: spill-resistant keyboard, MIL-STD chassis, all-day battery.",
    specifications: { cpu: "Intel Core i7", ram: "16GB", storage: "512GB SSD", screen: "14 inch" },
  },
  {
    slug: "dell-xps-13",
    name: "Dell XPS 13",
    category: "Laptops",
    priceInPaise: 9_499_900,
    stock: 7,
    sku: "US-LAP-XPS13",
    description:
      "Near-borderless 13.4-inch display in an aluminium chassis under 1.2kg. The travel laptop.",
    specifications: { cpu: "Intel Core i7", ram: "16GB", storage: "1TB SSD", screen: "13.4 inch" },
  },
  {
    slug: "macbook-air-m3",
    name: "MacBook Air M3",
    category: "Laptops",
    priceInPaise: 8_999_900,
    stock: 9,
    sku: "US-LAP-MBA-M3",
    description:
      "Fanless, silent, and 18 hours of battery. The M3 chip handles serious work without heat.",
    specifications: { cpu: "Apple M3", ram: "16GB", storage: "512GB SSD", screen: "13.6 inch" },
  },
  {
    slug: "monitor-27-4k",
    name: '27" 4K Monitor',
    category: "Monitors",
    priceInPaise: 1_899_900,
    stock: 15,
    sku: "US-MON-27-4K",
    description:
      "27-inch 4K IPS panel with 95% DCI-P3 coverage and a single-cable USB-C connection.",
    specifications: { resolution: "3840x2160", panel: "IPS", refresh: "60Hz", ports: "USB-C, HDMI 2.0" },
  },
  {
    slug: "mechanical-keyboard",
    name: "Mechanical Keyboard",
    category: "Accessories",
    priceInPaise: 399_900,
    stock: 30,
    sku: "US-ACC-KB-MECH",
    description:
      "Hot-swappable 75% mechanical keyboard with tactile brown switches and PBT keycaps.",
    specifications: { layout: "75%", switches: "Tactile Brown", connection: "USB-C + Bluetooth" },
  },
  {
    slug: "wireless-mouse",
    name: "Wireless Mouse",
    category: "Accessories",
    priceInPaise: 129_900,
    stock: 40,
    sku: "US-ACC-MOUSE-WL",
    description: "Silent-click wireless mouse with a 70-day battery and a 4000 DPI sensor.",
    specifications: { dpi: "4000", connection: "2.4GHz + Bluetooth", battery: "70 days" },
  },
  {
    slug: "usb-c-hub",
    name: "USB-C Hub",
    category: "Accessories",
    priceInPaise: 249_900,
    stock: 25,
    sku: "US-ACC-HUB-USBC",
    description:
      "7-in-1 USB-C hub: 100W pass-through charging, 4K HDMI, SD card reader, and 3 USB-A ports.",
    specifications: { ports: "7", passthrough: "100W", hdmi: "4K@60Hz" },
  },
  {
    slug: "laptop-sleeve-14",
    name: 'Laptop Sleeve 14"',
    category: "Accessories",
    priceInPaise: 149_900,
    stock: 35,
    sku: "US-ACC-SLEEVE-14",
    description: "Water-resistant felt sleeve with a fleece lining, sized for 14-inch laptops.",
    specifications: { fits: "14 inch", material: "Wool felt", pockets: "1 external" },
  },
  {
    slug: "noise-cancel-headset",
    name: "Noise-cancel Headset",
    category: "Audio",
    priceInPaise: 699_900,
    stock: 18,
    sku: "US-AUD-ANC-HS",
    description: "Over-ear ANC headset with a boom mic, 40-hour battery, and multipoint pairing.",
    specifications: { anc: "Hybrid", battery: "40 hours", mic: "Detachable boom" },
  },
];

export type SeedRelation = {
  productSlug: string;
  relatedProductSlug: string;
  relationType: string;
  score: number;
};

/** Cross-sell map from PRD.md section 8. */
export const SEED_RELATIONS: SeedRelation[] = [
  { productSlug: "thinkpad-x", relatedProductSlug: "usb-c-hub", relationType: "accessory", score: 0.9 },
  { productSlug: "thinkpad-x", relatedProductSlug: "laptop-sleeve-14", relationType: "accessory", score: 0.85 },
  { productSlug: "thinkpad-x", relatedProductSlug: "wireless-mouse", relationType: "accessory", score: 0.8 },
  { productSlug: "macbook-air-m3", relatedProductSlug: "usb-c-hub", relationType: "accessory", score: 0.9 },
  { productSlug: "macbook-air-m3", relatedProductSlug: "laptop-sleeve-14", relationType: "accessory", score: 0.85 },
  { productSlug: "dell-xps-13", relatedProductSlug: "usb-c-hub", relationType: "accessory", score: 0.9 },
  { productSlug: "dell-xps-13", relatedProductSlug: "noise-cancel-headset", relationType: "accessory", score: 0.75 },
  { productSlug: "monitor-27-4k", relatedProductSlug: "mechanical-keyboard", relationType: "accessory", score: 0.85 },
  { productSlug: "monitor-27-4k", relatedProductSlug: "wireless-mouse", relationType: "accessory", score: 0.8 },
];
