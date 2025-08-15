import { z, defineCollection } from "astro:content";

const blog = defineCollection({
    type: "content",
    schema: z.object({
        title: z.string(),
        date: z.date(),
        excerpt: z.string().optional(),
        image: z.string().optional(),
        tags: z.array(z.string()).optional(),
        slug: z.string().optional(), // optional manual override
    }),
});

export const collections = { blog };