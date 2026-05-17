import { defineCollection, z } from 'astro:content';

// English 360° — lesson content schema (Zod).
//
// Each lesson is a single JSON file in src/content/lessons/.
// All level entries (A1..C2) are individually optional so partial
// lessons still build — the UI renders "— ta sekcja w przygotowaniu —"
// in place of missing pieces instead of failing the build.

const yyyymmdd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const vocabItemSchema = z.object({
  term: z.string().min(1),
  ipa_br: z.string().optional(),
  pl: z.string().min(1),
  new: z.boolean().default(false),
});

// ── Exercise schemas (discriminated union by `type`) ──────────────────────

const matchChoiceSchema = z
  .object({
    label: z.string().min(1),
    text: z.string().optional(),
    image: z.string().optional(),
  })
  .refine((c) => c.text || c.image, {
    message: 'Each match choice needs either `text` or `image`.',
  });

const matchExercise = z.object({
  type: z.literal('match'),
  prompt: z.string(),
  items: z
    .array(
      z.object({
        word: z.string().min(1),
        answer: z.string().min(1),
      }),
    )
    .min(2),
  choices: z.array(matchChoiceSchema).min(2),
});

const gapExercise = z.object({
  type: z.literal('gap'),
  prompt: z.string(),
  items: z
    .array(
      z.object({
        sentence: z.string().min(1).describe('Sentence with one or more `___` blanks'),
        answer: z.string().min(1),
        alts: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});

const tfExercise = z.object({
  type: z.literal('tf'),
  prompt: z.string(),
  items: z
    .array(
      z.object({
        statement: z.string().min(1),
        answer: z.boolean(),
      }),
    )
    .min(1),
});

// Phase 2 exercise types — schemas defined so JSON can be authored now,
// interactive rendering arrives in phase 2.

const wordformExercise = z.object({
  type: z.literal('wordform'),
  prompt: z.string(),
  items: z
    .array(
      z.object({
        stem: z.string().min(1).describe('Base form to transform, e.g. "pollinate"'),
        sentence: z.string().min(1).describe('Sentence with ___ marking where the transformed word goes'),
        answer: z.string().min(1),
        hint: z.string().optional(),
      }),
    )
    .min(1),
});

const paraphraseExercise = z.object({
  type: z.literal('paraphrase'),
  prompt: z.string(),
  items: z
    .array(
      z.object({
        original: z.string().min(1),
        keyword: z.string().optional().describe('Word the answer must contain'),
        answer: z.string().min(1),
        alts: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});

const clozeExercise = z.object({
  type: z.literal('cloze'),
  prompt: z.string(),
  passage: z.string().min(1).describe('Passage with `___` blanks in order'),
  answers: z.array(z.string()).min(1),
  hints: z.array(z.string()).optional(),
});

const exerciseSchema = z.discriminatedUnion('type', [
  matchExercise,
  gapExercise,
  tfExercise,
  wordformExercise,
  paraphraseExercise,
  clozeExercise,
]);

const levelSchema = z
  .object({
    text: z.string().optional(),
    /** Literary Polish translation of `text`. Optional — UI shows a
     *  disabled "PL" toggle when missing for a given level. */
    text_pl: z.string().optional(),
    vocab: z.array(vocabItemSchema).optional(),
    /** One or more exercises rendered in order. Multiple exercises
     *  (e.g. a comprehension TF + a vocab wordform) can coexist on a
     *  single level. */
    exercises: z.array(exerciseSchema).optional(),
  })
  .optional();

// ── Lesson schema ─────────────────────────────────────────────────────────

const lessonsCollection = defineCollection({
  type: 'data',
  schema: z.object({
    id: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/, 'id must match YYYY-MM-DD-slug-with-dashes'),
    date_assigned: yyyymmdd,
    date_alternatives: z.array(yyyymmdd).default([]),
    title_en: z.string().min(1),
    title_pl: z.string().min(1),
    location: z.string().optional(),
    image: z.string().min(1).describe('Path under /public, e.g. /images/2026-05-14-bee.jpg'),
    image_orientation: z.enum(['landscape', 'portrait', 'square']).default('landscape'),
    tags: z.array(z.string()).default([]),
    themes: z.array(z.string()).default([]),
    did_you_know: z
      .object({
        en: z.string(),
        pl: z.string(),
      })
      .optional(),
    social: z
      .object({
        fb_caption_pl: z.string().optional(),
        fb_caption_en: z.string().optional(),
        hashtags: z.array(z.string()).default([]),
      })
      .optional(),
    levels: z.object({
      A1: levelSchema,
      A2: levelSchema,
      B1: levelSchema,
      B2: levelSchema,
      C1: levelSchema,
      C2: levelSchema,
    }),
  }),
});

export const collections = {
  lessons: lessonsCollection,
};
