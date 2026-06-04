const ANVIL_DEV_FLAG_KEYS = [
  "asr_visual_chairperson",
  "asr_visual_chairperson_owner",
  "asr_visual_chairperson_shadow",
] as const;

type StorageLike = {
  getItem(key: string): string | null;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function getParams(search: string): URLSearchParams {
  return new URLSearchParams(search || "");
}

function resolveFlagValue(args: {
  key: (typeof ANVIL_DEV_FLAG_KEYS)[number];
  search: string;
  storage?: StorageLike | null;
}): string | null {
  const params = getParams(args.search);
  const fromSearch = readString(params.get(args.key));
  if (fromSearch) return fromSearch;
  const fromStorage = readString(args.storage?.getItem(args.key));
  if (fromStorage) return fromStorage;
  return null;
}

export function appendAnvilDevFlagsToHref(args: {
  href: string;
  search: string;
  storage?: StorageLike | null;
}): string {
  const [pathname, rawSearch = ""] = args.href.split("?", 2);
  const params = new URLSearchParams(rawSearch);

  for (const key of ANVIL_DEV_FLAG_KEYS) {
    if (readString(params.get(key))) continue;
    const resolved = resolveFlagValue({ key, search: args.search, storage: args.storage });
    if (resolved) {
      params.set(key, resolved);
    }
  }

  const nextSearch = params.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}
