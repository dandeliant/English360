# English 360°

Codzienna lekcja angielskiego oparta na zdjęciu, na 6 poziomach CEFR (A1–C2). Statyczna strona generowana z plików JSON — jedna lekcja = jeden plik.

**Stack:** Astro 4 (SSG) · vanilla JS + CSS custom properties · TypeScript tylko dla schematu treści · TTS przez Web Speech API · hosting Cloudflare Pages.

**Bez:** Reacta, Vue, Tailwinda, baz danych w fazie 1, analytics, trackerów. Postępy użytkownika trzymane w `localStorage`.

## Uruchomienie lokalne

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # generuje statyczny HTML do dist/
npm run preview  # podgląd builda
```

Wymagania: Node.js ≥ 20.3.

## Jak dodać nową lekcję

1. **Zdjęcie** → wrzuć do `public/images/`. Konwencja nazewnictwa: `YYYY-MM-DD-slug.jpg`. Format JPG/WebP, ~1500 px szerokości, orientacja landscape lub portrait.
2. **JSON** → skopiuj `src/content/lessons/2026-05-14-bee-on-lavender.json` jako szablon, zmień nazwę na `YYYY-MM-DD-slug.json`, wypełnij treść.
   - Pole `id` musi pasować do nazwy pliku bez `.json`.
   - Pole `date_assigned` (YYYY-MM-DD) — data, kiedy lekcja pojawi się na stronie głównej.
   - `image` musi wskazywać na plik wrzucony w kroku 1, np. `/images/2026-05-14-bee-on-lavender.jpg`.
3. **Zbuduj** → `npm run build`. Walidacja Zod sprawdzi schemat; jeśli pole jest niewypełnione, w UI pojawi się komunikat „— ta sekcja w przygotowaniu —", build się NIE wywali.
4. **Commituj** → JSON + zdjęcie razem, w jednym commicie per lekcja.

## Struktura projektu

```
src/
├── content/
│   ├── config.ts            # Zod schema dla lekcji
│   └── lessons/*.json       # treść — jedna lekcja na plik
├── components/              # Astro components (LessonCard, LevelTabs, etc.)
├── layouts/BaseLayout.astro
├── pages/
│   ├── index.astro          # lekcja dnia z fallbackiem do najnowszej
│   ├── lekcja/[id].astro    # strona pojedynczej lekcji
│   └── o-projekcie.astro
├── scripts/                 # vanilla JS (tts, theme, level-memory)
└── styles/                  # tokens, reset, global
public/
└── images/                  # zdjęcia lekcji
```

## Schemat lekcji (skrót)

Pełny Zod w `src/content/config.ts`. Najważniejsze pola:

- `id`, `date_assigned`, `title_en`, `title_pl`, `location`, `image`, `tags`, `themes`
- `did_you_know.{en,pl}` — ciekawostka
- `social.{fb_caption_pl, fb_caption_en, hashtags}` — gotowe captions
- `levels.{A1,A2,B1,B2,C1,C2}` — każdy poziom (wszystkie opcjonalne):
  - `text` — tekst lekcji
  - `vocab[]` — `{ term, ipa_br, pl, new }`
  - `exercise` — jeden z 6 typów: `match` | `gap` | `tf` | `wordform` | `paraphrase` | `cloze`

## Faza 1 — co działa teraz

- [x] Setup Astro + TypeScript strict + gitignore
- [ ] Schemat Zod + jedna pełna przykładowa lekcja (bee on lavender, wszystkie 6 poziomów)
- [ ] Komponenty: `BaseLayout`, `LevelTabs`, `VocabTable`, `TTSButton`, `LessonCard`
- [ ] Ćwiczenia: `match`, `gap`, `tf` z walidacją (3 pozostałe — placeholdery)
- [ ] Dark mode + zapamiętany poziom w localStorage
- [ ] Klawisze 1–6 (poziomy), Space (TTS), strzałki (tablist)
- [ ] Strony: `/` (lekcja dnia), `/lekcja/[id]`, `/o-projekcie`
- [ ] Responsywność od 360 px, WCAG AA, Lighthouse mobile ≥95

## Faza 2 — roadmapa (nie buduję teraz)

- Strona `/archiwum` z filtrami (poziom, tag, miesiąc) i wyszukiwarką
- Widok `/kalendarz` — rok z klikalnymi dniami
- Strony per-poziom (`/poziom/B1`) i per-tag (`/tag/nature`)
- Pozostałe 3 typy ćwiczeń: `wordform`, `paraphrase`, `cloze`
- System postępu (które lekcje przeczytane, które ćwiczenia rozwiązane)
- PWA — instalowalna, offline cache dla ostatnich 30 lekcji
- GitHub Action z cron buildem codziennie o 6:00 (auto-rotacja „lekcji dnia")
- Strona „dla nauczycieli" + lead magnet (mailing)

## Licencja

TBD (osobista / niekomercyjna na razie). Zdjęcia lekcji — sprawdź licencję per plik.
