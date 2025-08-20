import { z, defineCollection } from "astro:content";

const blog = defineCollection({
    type: "content",
    schema: z.object({
        title: z.string(),
        date: z.date(),
        excerpt: z.string().optional(),
        image: z.string().optional(),
        categories: z.array(z.string()).optional(),
        slug: z.string().optional(), // optional manual override
        use_elevenlabs: z.boolean().default(false),
    }),
});

export const collections = { blog };