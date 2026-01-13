export type WikimediaImage = {
  title: string; // "File:Something.jpg"
  url: string; // full
  thumbUrl: string; // thumb
  w: number;
  h: number;
};

export type WikimediaCategory = {
  id: string;
  label: string;
  // Nombre max d’images à proposer pour cette catégorie
  limit: number;
  mode: "category_deep" | "search_multi";
  // Mode category_deep
  categoryTitle?: string; // Format attendu par l’API: "Category:..."
  // Mode search_multi (namespace 6)
  searchQueries?: string[];
};

export const WIKIMEDIA_CATEGORIES: WikimediaCategory[] = [
  // 5 thèmes × 100 images = 500 URLs max (chargées uniquement après action utilisateur).
  // On utilise des catégories "larges" et on remonte les sous-catégories (récursif) pour éviter des onglets vides.
  { id: "nature", label: "Nature", mode: "category_deep", categoryTitle: "Category:Landscapes", limit: 100 },
  {
    id: "monuments",
    label: "Monuments",
    mode: "search_multi",
    limit: 100,
    searchQueries: [
      "Taj Mahal",
      "Great Pyramid of Giza",
      "pyramids Giza",
      "Angkor Wat",
      "Petra",
      "Machu Picchu",
      "Colosseum",
      "Acropolis",
      "Great Wall of China",
      "Alhambra",
      "Neuschwanstein Castle",
      "Mont Saint-Michel",
      "temple",
      "castle",
      "cathedral",
    ],
  },
  { id: "histoire", label: "Histoire", mode: "category_deep", categoryTitle: "Category:History", limit: 100 },
  {
    id: "animals",
    label: "Animaux",
    mode: "search_multi",
    limit: 100,
    searchQueries: [
      "snow leopard",
      "tiger in the wild",
      "lion portrait",
      "cheetah",
      "red panda",
      "giant panda",
      "polar bear",
      "grizzly bear",
      "orca",
      "humpback whale",
      "dolphin",
      "eagle flight",
      "owl",
      "macaw",
      "kingfisher",
      "penguin colony",
      "sea turtle",
      "chameleon",
      "frog macro",
      "butterfly macro",
    ],
  },
];

function apiUrl(params: Record<string, string>) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("origin", "*"); // CORS
  return u.toString();
}

export async function fetchFileTitlesBySearch(searchQuery: string, limit: number): Promise<string[]> {
  const titles: string[] = [];
  let sroffset = 0;

  while (titles.length < limit) {
    const batchLimit = Math.min(50, limit - titles.length);
    const url = apiUrl({
      action: "query",
      format: "json",
      list: "search",
      srsearch: searchQuery,
      srnamespace: "6", // File:
      srlimit: String(batchLimit),
      sroffset: String(sroffset),
    });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikimedia API error (${res.status})`);
    const json = (await res.json()) as any;
    const results = json?.query?.search ?? [];
    for (const r of results) {
      const t = r?.title;
      if (typeof t === "string") titles.push(t);
    }
    const got = results.length as number;
    if (!got) break;
    sroffset += got;
  }

  return titles;
}

export async function fetchFileTitlesBySearchMulti(queries: string[], limit: number): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();

  // On répartit le budget entre requêtes, mais on boucle jusqu’à remplir si possible.
  const perQuery = Math.max(10, Math.ceil(limit / Math.max(1, queries.length)));
  for (const q of queries) {
    if (out.length >= limit) break;
    const titles = await fetchFileTitlesBySearch(q, Math.min(perQuery, limit - out.length));
    for (const t of titles) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= limit) break;
    }
  }

  return out;
}

export async function fetchCategoryFileTitles(categoryTitle: string, limit: number): Promise<string[]> {
  const titles: string[] = [];
  let cmcontinue: string | null = null;

  while (titles.length < limit) {
    const batchLimit = Math.min(50, limit - titles.length);
    const url = apiUrl({
      action: "query",
      format: "json",
      list: "categorymembers",
      cmtitle: categoryTitle,
      cmtype: "file",
      cmlimit: String(batchLimit),
      ...(cmcontinue ? { cmcontinue } : {}),
    });

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikimedia API error (${res.status})`);
    const json = (await res.json()) as any;
    const cms = json?.query?.categorymembers ?? [];
    for (const it of cms) {
      if (typeof it?.title === "string") titles.push(it.title);
    }
    cmcontinue = json?.continue?.cmcontinue ?? null;
    if (!cmcontinue) break;
  }

  return titles;
}

export async function fetchCategoryFileTitlesDeep(
  categoryTitle: string,
  limit: number,
  opts?: { maxDepth?: number; maxRequests?: number },
): Promise<string[]> {
  const maxDepth = opts?.maxDepth ?? 3;
  const maxRequests = opts?.maxRequests ?? 80;

  const out: string[] = [];
  const seenCats = new Set<string>();
  const seenFiles = new Set<string>();
  const queue: Array<{ title: string; depth: number }> = [{ title: categoryTitle, depth: 0 }];
  seenCats.add(categoryTitle);

  let requests = 0;

  while (queue.length && out.length < limit && requests < maxRequests) {
    const { title: catTitle, depth } = queue.shift()!;
    let cmcontinue: string | null = null;

    // On récupère un mélange fichiers + sous-catégories dans cette catégorie.
    while (out.length < limit && requests < maxRequests) {
      requests++;
      const batchLimit = Math.min(50, Math.max(1, limit - out.length));
      const url = apiUrl({
        action: "query",
        format: "json",
        list: "categorymembers",
        cmtitle: catTitle,
        cmtype: "file|subcat",
        cmlimit: String(batchLimit),
        ...(cmcontinue ? { cmcontinue } : {}),
      });

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Wikimedia API error (${res.status})`);
      const json = (await res.json()) as any;
      const cms = json?.query?.categorymembers ?? [];

      for (const it of cms) {
        const t = it?.title;
        const ns = it?.ns;
        if (typeof t !== "string") continue;
        if (ns === 6) {
          if (!seenFiles.has(t)) {
            seenFiles.add(t);
            out.push(t);
            if (out.length >= limit) break;
          }
        } else if (ns === 14) {
          if (depth + 1 <= maxDepth && !seenCats.has(t)) {
            seenCats.add(t);
            queue.push({ title: t, depth: depth + 1 });
          }
        }
      }

      cmcontinue = json?.continue?.cmcontinue ?? null;
      if (!cmcontinue) break;
    }
  }

  return out;
}

export async function fetchImageInfos(titles: string[], thumbWidth: number): Promise<WikimediaImage[]> {
  const out: WikimediaImage[] = [];
  // API: max 50 titles per request
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url = apiUrl({
      action: "query",
      format: "json",
      prop: "imageinfo",
      iiprop: "url|size",
      iiurlwidth: String(thumbWidth),
      titles: batch.join("|"),
    });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikimedia API error (${res.status})`);
    const json = (await res.json()) as any;
    const pages = Object.values(json?.query?.pages ?? {}) as any[];
    for (const p of pages) {
      const title = p?.title;
      const ii = p?.imageinfo?.[0];
      const urlFull = ii?.url;
      const urlThumb = ii?.thumburl;
      const w = ii?.width;
      const h = ii?.height;
      if (
        typeof title === "string" &&
        typeof urlFull === "string" &&
        typeof urlThumb === "string" &&
        typeof w === "number" &&
        typeof h === "number"
      ) {
        out.push({ title, url: urlFull, thumbUrl: urlThumb, w, h });
      }
    }
  }
  return out;
}


