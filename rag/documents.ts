/**
 * Urban Store's knowledge base — synthetic, original text written for this project.
 *
 * These are the ONLY source of policy answers. The assistant is not permitted to
 * invent policy, so anything a customer might reasonably ask about returns,
 * warranty, shipping or buying advice needs to exist here or the honest answer is
 * "I couldn't find that in Urban Store's knowledge base."
 *
 * Each document is split into chunks at the blank line. Chunks are embedded
 * individually, so each one should stand on its own — a chunk retrieved without
 * its neighbours must still make sense to a reader.
 */

export type KnowledgeDoc = {
  docType: string;
  title: string;
  /** Chunks, already split. Keep each to a short paragraph on one topic. */
  chunks: string[];
};

export const KNOWLEDGE_DOCS: KnowledgeDoc[] = [
  {
    docType: "return_policy",
    title: "Urban Store Return Policy",
    chunks: [
      "Urban Store accepts returns within 14 days of delivery for most items. The 14-day window starts on the day the courier marks your order delivered, not the day you placed it. To start a return, use the order history page or reply to your order confirmation email.",
      "Returned items must be in resalable condition: original box, all included cables and adapters, and any manuals or accessories that shipped with the product. Items returned without the original packaging may be refused or subject to a restocking fee of up to 15% of the item price.",
      "Laptops and monitors have a stricter condition check than accessories. Screens must be free of scratches and the device must power on and pass a basic hardware check at our warehouse. If a laptop shows physical damage that was not reported at the time of return, we will contact you before processing.",
      "Refunds are issued to the original payment method within 5 to 7 business days after the returned item passes inspection. Card refunds can take an additional 2 to 3 business days to appear on your statement depending on your bank. We do not offer store credit in place of a refund unless you specifically request it.",
      "Some items cannot be returned once opened: earphones and in-ear audio products with broken hygiene seals, software licences, and any item marked 'final sale' on its product page. Headsets with over-ear cushions, including the Noise-cancel Headset, can be returned if the hygiene seal is intact.",
      "If your item arrived damaged or you received the wrong product, contact us within 48 hours of delivery. These cases are not treated as ordinary returns: we arrange free pickup, and you are not charged a restocking fee or return shipping.",
    ],
  },
  {
    docType: "warranty",
    title: "Urban Store Warranty Terms",
    chunks: [
      "All laptops sold by Urban Store carry a 12-month manufacturer warranty starting from the invoice date. The warranty covers manufacturing defects and component failure under normal use. Keep your invoice — it is the proof of purchase required for any claim.",
      "Monitors carry a 24-month warranty that includes a dead-pixel policy: we replace a panel with five or more stuck or dead pixels, or with any single dead pixel in the central viewing area. Fewer than five pixels outside the central area is considered within manufacturing tolerance.",
      "Accessories such as keyboards, mice, hubs and sleeves carry a 6-month warranty against defects. Cables and connectors that fail from ordinary wear are covered in the first 6 months but not beyond, since cable wear is treated as consumable.",
      "The warranty does not cover liquid damage, cracked screens from drops, damage from using a non-approved charger, or any fault caused by opening the device yourself. Removing a manufacturer seal voids the warranty on the affected component.",
      "Battery capacity loss is only a warranty issue if the battery drops below 70% of rated capacity within the first 12 months. Gradual capacity loss above that threshold is normal and not covered.",
      "To raise a warranty claim, contact Urban Store support with your order number and a short description of the fault. Most laptop and monitor claims are handled through the manufacturer's authorised service centre; we coordinate the claim and track it on your behalf.",
    ],
  },
  {
    docType: "shipping",
    title: "Urban Store Shipping and Delivery",
    chunks: [
      "Standard delivery within India is free on all orders above ₹999 and takes 3 to 5 business days for metro cities. Orders below ₹999 carry a flat ₹99 shipping charge. Business days exclude Sundays and public holidays.",
      "Express delivery is available at checkout for ₹299 and delivers in 1 to 2 business days to serviceable pin codes. Express orders placed after 2 PM are dispatched the next business day, so a Friday afternoon order typically arrives Monday or Tuesday.",
      "Non-metro and remote pin codes take 5 to 8 business days. A small number of pin codes are not serviceable for large items such as 27-inch monitors; the checkout page will tell you before you pay if your address falls in that category.",
      "Every order ships with a tracking link sent by email once the courier collects the package. Laptops and monitors ship in tamper-evident packaging and require a signature and an OTP on delivery, so someone must be available at the address.",
      "If a delivery attempt fails, the courier retries twice on the following business days. After three failed attempts the package returns to our warehouse and we refund the order minus any shipping charge already incurred.",
      "We currently ship only within India. International shipping and same-day delivery are not offered.",
    ],
  },
  {
    docType: "buying_guide",
    title: "Choosing a Laptop for Programming",
    chunks: [
      "For most programming work, memory matters more than raw processor speed. 16GB of RAM is the practical floor if you run a browser with many tabs alongside an IDE, a database and a container runtime. All three laptops Urban Store carries ship with 16GB.",
      "Storage should be SSD, and 512GB is comfortable for most developers. Choose 1TB if you work with large datasets, virtual machines, or several sizeable repositories at once. The Dell XPS 13 is the only model we stock with 1TB as standard.",
      "The ThinkPad X suits developers who type all day and value a keyboard with real travel, a durable chassis, and easy servicing. It is the most practical choice for someone who works on the move and treats the machine as a tool rather than an object.",
      "The MacBook Air M3 is the quietest option because it has no fan, and its battery comfortably lasts a full working day. It suits web, mobile and general application development, and is the natural pick for anyone building for Apple platforms. It is less suitable if your toolchain depends on x86-only software.",
      "The Dell XPS 13 is the most portable of the three at under 1.2kg, with the sharpest display and the largest standard storage. It is the best fit for developers who travel frequently and want a premium screen for long editing sessions.",
      "Whichever laptop you choose, a USB-C hub is worth adding if you use an external monitor, wired networking, or SD cards — all three machines have limited ports. A separate mechanical keyboard and mouse make a real difference to comfort at a fixed desk.",
    ],
  },
];
