import { z } from "zod";

export const productQuerySchema = z.object({
  category: z.string().min(1).max(64).optional(),
  q: z.string().min(1).max(128).optional(),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  priceInPaise: number;
  stock: number;
  imageUrl: string | null;
};

export type ProductDetail = ProductListItem & {
  sku: string;
  description: string | null;
  specifications: Record<string, string>;
};
