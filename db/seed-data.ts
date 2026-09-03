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
    specifications: {
      cpu: "Intel Core i7",
      ram: "16GB",
      storage: "512GB SSD",
      screen: "14 inch",
    },
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
    specifications: {
      cpu: "Intel Core i7",
      ram: "16GB",
      storage: "1TB SSD",
      screen: "13.4 inch",
    },
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
    specifications: {
      cpu: "Apple M3",
      ram: "16GB",
      storage: "512GB SSD",
      screen: "13.6 inch",
    },
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
    specifications: {
      resolution: "3840x2160",
      panel: "IPS",
      refresh: "60Hz",
      ports: "USB-C, HDMI 2.0",
    },
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
    specifications: {
      layout: "75%",
      switches: "Tactile Brown",
      connection: "USB-C + Bluetooth",
    },
  },
  {
    slug: "wireless-mouse",
    name: "Wireless Mouse",
    category: "Accessories",
    priceInPaise: 129_900,
    stock: 40,
    sku: "US-ACC-MOUSE-WL",
    description:
      "Silent-click wireless mouse with a 70-day battery and a 4000 DPI sensor.",
    specifications: {
      dpi: "4000",
      connection: "2.4GHz + Bluetooth",
      battery: "70 days",
    },
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
    description:
      "Water-resistant felt sleeve with a fleece lining, sized for 14-inch laptops.",
    specifications: {
      fits: "14 inch",
      material: "Wool felt",
      pockets: "1 external",
    },
  },
  {
    slug: "noise-cancel-headset",
    name: "Noise-cancel Headset",
    category: "Audio",
    priceInPaise: 699_900,
    stock: 18,
    sku: "US-AUD-ANC-HS",
    description:
      "Over-ear ANC headset with a boom mic, 40-hour battery, and multipoint pairing.",
    specifications: {
      anc: "Hybrid",
      battery: "40 hours",
      mic: "Detachable boom",
    },
  },

  // ---------------------------------------------------------------------------
  // Catalogue expansion. Purely additive: every slug, price and SKU above is
  // unchanged, because tests, the AI-buyer demo and previously verified orders
  // all reference them by slug.
  //
  // Every laptop added here is priced ABOVE the ThinkPad X. The AI-buyer picks
  // the cheapest in-stock laptop, and a new budget model would silently
  // re-target that demo at a product nobody has verified end to end.
  // ---------------------------------------------------------------------------

  {
    slug: "asus-zenbook-14",
    name: "ASUS Zenbook 14 OLED",
    category: "Laptops",
    priceInPaise: 8_499_900,
    stock: 11,
    sku: "US-LAP-ZB14",
    description:
      "A 14-inch 3K OLED panel in a 1.2kg magnesium body. The one to buy if the screen matters most.",
    specifications: {
      cpu: "Intel Core Ultra 7",
      ram: "16GB",
      storage: "1TB SSD",
      screen: "14 inch 3K OLED",
    },
  },
  {
    slug: "hp-spectre-x360",
    name: "HP Spectre x360",
    category: "Laptops",
    priceInPaise: 12_499_900,
    stock: 5,
    sku: "US-LAP-SPX360",
    description:
      "A convertible that folds flat into a tablet, with a bundled stylus and a 3:2 touch display.",
    specifications: {
      cpu: "Intel Core Ultra 7",
      ram: "32GB",
      storage: "1TB SSD",
      screen: "13.5 inch touch",
    },
  },
  {
    slug: "macbook-pro-14",
    name: "MacBook Pro 14",
    category: "Laptops",
    priceInPaise: 16_999_900,
    stock: 4,
    sku: "US-LAP-MBP14",
    description:
      "M3 Pro with a 120Hz mini-LED display. Built for sustained load — video, compiles, large datasets.",
    specifications: {
      cpu: "Apple M3 Pro",
      ram: "18GB",
      storage: "1TB SSD",
      screen: "14.2 inch mini-LED",
    },
  },

  {
    slug: "monitor-24-fhd",
    name: '24" FHD Monitor',
    category: "Monitors",
    priceInPaise: 949_900,
    stock: 22,
    sku: "US-MON-24-FHD",
    description:
      "A 24-inch 1080p IPS panel with a height-adjustable stand. The sensible second screen.",
    specifications: {
      resolution: "1920x1080",
      panel: "IPS",
      refresh: "75Hz",
      ports: "HDMI, DisplayPort",
    },
  },
  {
    slug: "ultrawide-34",
    name: '34" Ultrawide Monitor',
    category: "Monitors",
    priceInPaise: 5_499_900,
    stock: 6,
    sku: "US-MON-34-UW",
    description:
      "A 34-inch 21:9 curved panel that replaces a dual-monitor setup, with 90W USB-C power delivery.",
    specifications: {
      resolution: "3440x1440",
      panel: "VA curved",
      refresh: "100Hz",
      ports: "USB-C 90W, HDMI, DisplayPort",
    },
  },

  {
    slug: "webcam-1080p",
    name: "1080p Webcam",
    category: "Accessories",
    priceInPaise: 349_900,
    stock: 28,
    sku: "US-ACC-CAM-1080",
    description:
      "1080p60 webcam with autofocus, a dual-mic array and a physical privacy shutter.",
    specifications: {
      resolution: "1080p60",
      focus: "Autofocus",
      mount: "Clip + tripod thread",
    },
  },
  {
    slug: "laptop-stand-alu",
    name: "Aluminium Laptop Stand",
    category: "Accessories",
    priceInPaise: 229_900,
    stock: 32,
    sku: "US-ACC-STAND-ALU",
    description:
      "Folding aluminium stand that lifts the screen to eye level and stows flat in a bag.",
    specifications: {
      fits: "11-16 inch",
      material: "Anodised aluminium",
      folded: "1.5cm",
    },
  },
  {
    slug: "docking-station",
    name: "Thunderbolt Dock",
    category: "Accessories",
    priceInPaise: 1_499_900,
    stock: 10,
    sku: "US-ACC-DOCK-TB",
    description:
      "One cable for two 4K displays, gigabit ethernet, 96W charging and five USB ports.",
    specifications: {
      displays: "2 x 4K@60Hz",
      charging: "96W",
      ethernet: "Gigabit",
      ports: "11",
    },
  },
  {
    slug: "external-ssd-1tb",
    name: "Portable SSD 1TB",
    category: "Accessories",
    priceInPaise: 899_900,
    stock: 20,
    sku: "US-ACC-SSD-1TB",
    description:
      "Pocket-sized 1TB NVMe drive at 1050MB/s, with hardware encryption and a rubberised shell.",
    specifications: {
      capacity: "1TB",
      speed: "1050MB/s read",
      interface: "USB-C 3.2 Gen 2",
    },
  },
  {
    slug: "cable-organizer",
    name: "Desk Cable Organiser",
    category: "Accessories",
    priceInPaise: 69_900,
    stock: 50,
    sku: "US-ACC-CABLE-ORG",
    description:
      "Weighted silicone channel that keeps five cables on the desk instead of behind it.",
    specifications: {
      slots: "5",
      material: "Silicone",
      adhesive: "Reusable 3M",
    },
  },

  {
    slug: "wired-earbuds",
    name: "Wired Earbuds",
    category: "Audio",
    priceInPaise: 149_900,
    stock: 40,
    sku: "US-AUD-EB-WIRED",
    description:
      "USB-C earbuds with an inline mic. No pairing, no charging — the pair you keep in the bag.",
    specifications: {
      connection: "USB-C",
      driver: "10mm dynamic",
      mic: "Inline",
    },
  },
  {
    slug: "desk-speaker",
    name: "Desk Speaker",
    category: "Audio",
    priceInPaise: 599_900,
    stock: 14,
    sku: "US-AUD-SPK-DESK",
    description:
      "A compact 2.0 stereo pair for a desk, over USB-C or Bluetooth, with a front volume dial.",
    specifications: {
      output: "2 x 15W",
      connection: "USB-C + Bluetooth 5.3",
      controls: "Front dial",
    },
  },
];

export type SeedRelation = {
  productSlug: string;
  relatedProductSlug: string;
  relationType: string;
  score: number;
};

/**
 * Cross-sell map. The nine rows from PRD.md section 8 are kept verbatim; the
 * rest densify them so every laptop and every monitor has four or five genuine
 * companions rather than two.
 *
 * Scores are a deliberate ranking, not noise. `getRelatedProducts` shows the top
 * three, so the highest score per product is what a shopper actually sees first:
 * the thing they would have had to come back for. Ordering within a product is
 * "cannot use it without" > "will want within a week" > "nice to have".
 *
 * The same table feeds `compatibleWith` in the agent catalog, so an autonomous
 * buyer reads the identical recommendations a human does.
 */
export const SEED_RELATIONS: SeedRelation[] = [
  // --- Laptops -------------------------------------------------------------
  {
    productSlug: "thinkpad-x",
    relatedProductSlug: "usb-c-hub",
    relationType: "accessory",
    score: 0.9,
  },
  {
    productSlug: "thinkpad-x",
    relatedProductSlug: "laptop-sleeve-14",
    relationType: "accessory",
    score: 0.85,
  },
  {
    productSlug: "thinkpad-x",
    relatedProductSlug: "wireless-mouse",
    relationType: "accessory",
    score: 0.8,
  },
  {
    productSlug: "thinkpad-x",
    relatedProductSlug: "laptop-stand-alu",
    relationType: "accessory",
    score: 0.72,
  },
  {
    productSlug: "thinkpad-x",
    relatedProductSlug: "external-ssd-1tb",
    relationType: "accessory",
    score: 0.66,
  },

  {
    productSlug: "dell-xps-13",
    relatedProductSlug: "usb-c-hub",
    relationType: "accessory",
    score: 0.9,
  },
  {
    productSlug: "dell-xps-13",
    relatedProductSlug: "laptop-sleeve-14",
    relationType: "accessory",
    score: 0.84,
  },
  {
    productSlug: "dell-xps-13",
    relatedProductSlug: "wireless-mouse",
    relationType: "accessory",
    score: 0.78,
  },
  {
    productSlug: "dell-xps-13",
    relatedProductSlug: "noise-cancel-headset",
    relationType: "accessory",
    score: 0.75,
  },
  {
    productSlug: "dell-xps-13",
    relatedProductSlug: "laptop-stand-alu",
    relationType: "accessory",
    score: 0.7,
  },

  {
    productSlug: "macbook-air-m3",
    relatedProductSlug: "usb-c-hub",
    relationType: "accessory",
    score: 0.9,
  },
  {
    productSlug: "macbook-air-m3",
    relatedProductSlug: "laptop-sleeve-14",
    relationType: "accessory",
    score: 0.85,
  },
  {
    productSlug: "macbook-air-m3",
    relatedProductSlug: "wireless-mouse",
    relationType: "accessory",
    score: 0.79,
  },
  {
    productSlug: "macbook-air-m3",
    relatedProductSlug: "laptop-stand-alu",
    relationType: "accessory",
    score: 0.74,
  },
  {
    productSlug: "macbook-air-m3",
    relatedProductSlug: "monitor-27-4k",
    relationType: "complement",
    score: 0.62,
  },

  {
    productSlug: "asus-zenbook-14",
    relatedProductSlug: "usb-c-hub",
    relationType: "accessory",
    score: 0.88,
  },
  {
    productSlug: "asus-zenbook-14",
    relatedProductSlug: "laptop-sleeve-14",
    relationType: "accessory",
    score: 0.83,
  },
  {
    productSlug: "asus-zenbook-14",
    relatedProductSlug: "wireless-mouse",
    relationType: "accessory",
    score: 0.78,
  },
  {
    productSlug: "asus-zenbook-14",
    relatedProductSlug: "laptop-stand-alu",
    relationType: "accessory",
    score: 0.71,
  },
  {
    productSlug: "asus-zenbook-14",
    relatedProductSlug: "wired-earbuds",
    relationType: "accessory",
    score: 0.6,
  },

  {
    productSlug: "hp-spectre-x360",
    relatedProductSlug: "docking-station",
    relationType: "accessory",
    score: 0.86,
  },
  {
    productSlug: "hp-spectre-x360",
    relatedProductSlug: "laptop-sleeve-14",
    relationType: "accessory",
    score: 0.8,
  },
  {
    productSlug: "hp-spectre-x360",
    relatedProductSlug: "wireless-mouse",
    relationType: "accessory",
    score: 0.76,
  },
  {
    productSlug: "hp-spectre-x360",
    relatedProductSlug: "noise-cancel-headset",
    relationType: "accessory",
    score: 0.72,
  },
  {
    productSlug: "hp-spectre-x360",
    relatedProductSlug: "external-ssd-1tb",
    relationType: "accessory",
    score: 0.65,
  },

  {
    productSlug: "macbook-pro-14",
    relatedProductSlug: "docking-station",
    relationType: "accessory",
    score: 0.88,
  },
  {
    productSlug: "macbook-pro-14",
    relatedProductSlug: "usb-c-hub",
    relationType: "accessory",
    score: 0.84,
  },
  {
    productSlug: "macbook-pro-14",
    relatedProductSlug: "external-ssd-1tb",
    relationType: "accessory",
    score: 0.8,
  },
  {
    productSlug: "macbook-pro-14",
    relatedProductSlug: "monitor-27-4k",
    relationType: "complement",
    score: 0.74,
  },
  {
    productSlug: "macbook-pro-14",
    relatedProductSlug: "noise-cancel-headset",
    relationType: "accessory",
    score: 0.68,
  },

  // --- Monitors ------------------------------------------------------------
  {
    productSlug: "monitor-27-4k",
    relatedProductSlug: "mechanical-keyboard",
    relationType: "accessory",
    score: 0.85,
  },
  {
    productSlug: "monitor-27-4k",
    relatedProductSlug: "wireless-mouse",
    relationType: "accessory",
    score: 0.8,
  },
  {
    productSlug: "monitor-27-4k",
    relatedProductSlug: "webcam-1080p",
    relationType: "accessory",
    score: 0.76,
  },
  {
    productSlug: "monitor-27-4k",
    relatedProductSlug: "docking-station",
    relationType: "accessory",
    score: 0.7,
  },
  {
    productSlug: "monitor-27-4k",
    relatedProductSlug: "desk-speaker",
    relationType: "accessory",
    score: 0.64,
  },

  {
    productSlug: "monitor-24-fhd",
    relatedProductSlug: "mechanical-keyboard",
    relationType: "accessory",
    score: 0.82,
  },
  {
    productSlug: "monitor-24-fhd",
    relatedProductSlug: "wireless-mouse",
    relationType: "accessory",
    score: 0.8,
  },
  {
    productSlug: "monitor-24-fhd",
    relatedProductSlug: "webcam-1080p",
    relationType: "accessory",
    score: 0.74,
  },
  {
    productSlug: "monitor-24-fhd",
    relatedProductSlug: "cable-organizer",
    relationType: "accessory",
    score: 0.6,
  },
  {
    productSlug: "monitor-24-fhd",
    relatedProductSlug: "wired-earbuds",
    relationType: "accessory",
    score: 0.55,
  },

  {
    productSlug: "ultrawide-34",
    relatedProductSlug: "mechanical-keyboard",
    relationType: "accessory",
    score: 0.86,
  },
  {
    productSlug: "ultrawide-34",
    relatedProductSlug: "wireless-mouse",
    relationType: "accessory",
    score: 0.82,
  },
  {
    productSlug: "ultrawide-34",
    relatedProductSlug: "docking-station",
    relationType: "accessory",
    score: 0.78,
  },
  {
    productSlug: "ultrawide-34",
    relatedProductSlug: "webcam-1080p",
    relationType: "accessory",
    score: 0.72,
  },
  {
    productSlug: "ultrawide-34",
    relatedProductSlug: "desk-speaker",
    relationType: "accessory",
    score: 0.66,
  },

  // --- Accessories and audio, so their detail pages are not bare either -----
  {
    productSlug: "mechanical-keyboard",
    relatedProductSlug: "wireless-mouse",
    relationType: "accessory",
    score: 0.8,
  },
  {
    productSlug: "mechanical-keyboard",
    relatedProductSlug: "cable-organizer",
    relationType: "accessory",
    score: 0.62,
  },
  {
    productSlug: "mechanical-keyboard",
    relatedProductSlug: "laptop-stand-alu",
    relationType: "accessory",
    score: 0.55,
  },

  {
    productSlug: "docking-station",
    relatedProductSlug: "monitor-27-4k",
    relationType: "complement",
    score: 0.7,
  },
  {
    productSlug: "docking-station",
    relatedProductSlug: "cable-organizer",
    relationType: "accessory",
    score: 0.65,
  },
  {
    productSlug: "docking-station",
    relatedProductSlug: "external-ssd-1tb",
    relationType: "accessory",
    score: 0.6,
  },

  {
    productSlug: "webcam-1080p",
    relatedProductSlug: "desk-speaker",
    relationType: "accessory",
    score: 0.62,
  },
  {
    productSlug: "webcam-1080p",
    relatedProductSlug: "noise-cancel-headset",
    relationType: "accessory",
    score: 0.58,
  },
];
