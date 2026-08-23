import {
  createContext,
  useCallback,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { color, font, fontSize, radius } from "./theme.js";

const artwork = {
  atomic: new URL("./card-backs/assets/atomic.webp", import.meta.url).href,
  bauhaus: new URL("./card-backs/assets/bauhaus.webp", import.meta.url).href,
  botanical: new URL("./card-backs/assets/botanical.webp", import.meta.url)
    .href,
  celestial: new URL("./card-backs/assets/celestial.webp", import.meta.url)
    .href,
  deco: new URL("./card-backs/assets/deco.webp", import.meta.url).href,
  heritage: new URL("./card-backs/assets/heritage.webp", import.meta.url).href,
  mosaic: new URL("./card-backs/assets/mosaic.webp", import.meta.url).href,
  waves: new URL("./card-backs/assets/waves.webp", import.meta.url).href,
  weave: new URL("./card-backs/assets/weave.webp", import.meta.url).href,
} as const;

const thumbnails = {
  atomic: new URL("./card-backs/assets/atomic-thumb.webp", import.meta.url)
    .href,
  bauhaus: new URL("./card-backs/assets/bauhaus-thumb.webp", import.meta.url)
    .href,
  botanical: new URL(
    "./card-backs/assets/botanical-thumb.webp",
    import.meta.url,
  ).href,
  celestial: new URL(
    "./card-backs/assets/celestial-thumb.webp",
    import.meta.url,
  ).href,
  deco: new URL("./card-backs/assets/deco-thumb.webp", import.meta.url).href,
  heritage: new URL("./card-backs/assets/heritage-thumb.webp", import.meta.url)
    .href,
  mosaic: new URL("./card-backs/assets/mosaic-thumb.webp", import.meta.url)
    .href,
  waves: new URL("./card-backs/assets/waves-thumb.webp", import.meta.url).href,
  weave: new URL("./card-backs/assets/weave-thumb.webp", import.meta.url).href,
} as const;

export const CARD_BACK_DESIGN_IDS = [
  "heritage",
  "deco",
  "botanical",
  "waves",
  "bauhaus",
  "atomic",
  "mosaic",
  "celestial",
  "weave",
] as const;

export type CardBackDesignId = (typeof CARD_BACK_DESIGN_IDS)[number];

export interface CardBackDesign {
  readonly id: CardBackDesignId;
  readonly name: string;
  readonly description: string;
  readonly artwork: string;
  readonly thumbnail: string;
}

export const DEFAULT_CARD_BACK_DESIGN: CardBackDesignId = "deco";

export const cardBackDesigns: readonly CardBackDesign[] = [
  {
    id: "heritage",
    name: "Heritage",
    description: "Traditional rosette and filigree.",
    artwork: artwork.heritage,
    thumbnail: thumbnails.heritage,
  },
  {
    id: "deco",
    name: "Deco",
    description: "Bold 1920s diamond geometry.",
    artwork: artwork.deco,
    thumbnail: thumbnails.deco,
  },
  {
    id: "botanical",
    name: "Botanical",
    description: "Engraved acanthus and florals.",
    artwork: artwork.botanical,
    thumbnail: thumbnails.botanical,
  },
  {
    id: "waves",
    name: "Waves",
    description: "Indigo Japanese wave ornament.",
    artwork: artwork.waves,
    thumbnail: thumbnails.waves,
  },
  {
    id: "bauhaus",
    name: "Bauhaus",
    description: "Modernist circles and blocks.",
    artwork: artwork.bauhaus,
    thumbnail: thumbnails.bauhaus,
  },
  {
    id: "atomic",
    name: "Atomic",
    description: "Mid-century orbits and starbursts.",
    artwork: artwork.atomic,
    thumbnail: thumbnails.atomic,
  },
  {
    id: "mosaic",
    name: "Mosaic",
    description: "Emerald geometric tilework.",
    artwork: artwork.mosaic,
    thumbnail: thumbnails.mosaic,
  },
  {
    id: "celestial",
    name: "Celestial",
    description: "Moonlit astronomical engraving.",
    artwork: artwork.celestial,
    thumbnail: thumbnails.celestial,
  },
  {
    id: "weave",
    name: "Weave",
    description: "Minimal monochrome ribbons.",
    artwork: artwork.weave,
    thumbnail: thumbnails.weave,
  },
];

const designsById = Object.fromEntries(
  cardBackDesigns.map((design) => [design.id, design]),
) as Record<CardBackDesignId, CardBackDesign>;

export function isCardBackDesignId(value: string): value is CardBackDesignId {
  return Object.hasOwn(designsById, value);
}

export function cardBackStyle(
  designId: CardBackDesignId,
  variant: "full" | "thumbnail" = "full",
): CSSProperties {
  const design = designsById[designId];
  return {
    backgroundColor: color.cardBackBase,
    backgroundImage: `url("${variant === "thumbnail" ? design.thumbnail : design.artwork}")`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  };
}

export function loadCardBackDesign(
  storage: Storage,
  key: string,
): CardBackDesignId {
  try {
    const stored = storage.getItem(key);
    return stored !== null && isCardBackDesignId(stored)
      ? stored
      : DEFAULT_CARD_BACK_DESIGN;
  } catch {
    return DEFAULT_CARD_BACK_DESIGN;
  }
}

export function saveCardBackDesign(
  storage: Storage,
  key: string,
  design: CardBackDesignId,
): void {
  try {
    storage.setItem(key, design);
  } catch {
    return;
  }
}

export function useStoredCardBackDesign(
  key: string,
): readonly [CardBackDesignId, (design: CardBackDesignId) => void] {
  const [design, setDesign] = useState<CardBackDesignId>(() =>
    typeof window === "undefined"
      ? DEFAULT_CARD_BACK_DESIGN
      : loadCardBackDesign(window.localStorage, key),
  );
  const selectDesign = useCallback(
    (next: CardBackDesignId) => {
      setDesign(next);
      if (typeof window !== "undefined") {
        saveCardBackDesign(window.localStorage, key, next);
      }
    },
    [key],
  );
  return [design, selectDesign] as const;
}

interface CardBackDesignContextValue {
  readonly design: CardBackDesignId;
  readonly onChange: (design: CardBackDesignId) => void;
}

const CardBackDesignContext = createContext<CardBackDesignContextValue>({
  design: DEFAULT_CARD_BACK_DESIGN,
  onChange: () => undefined,
});

export function CardBackDesignProvider({
  design,
  onChange,
  children,
}: CardBackDesignContextValue & { readonly children: ReactNode }) {
  return (
    <CardBackDesignContext.Provider value={{ design, onChange }}>
      {children}
    </CardBackDesignContext.Provider>
  );
}

export function StoredCardBackDesignProvider({
  storageKey,
  children,
}: {
  readonly storageKey: string;
  readonly children: ReactNode;
}) {
  const [design, onChange] = useStoredCardBackDesign(storageKey);
  return (
    <CardBackDesignProvider design={design} onChange={onChange}>
      {children}
    </CardBackDesignProvider>
  );
}

export function useCardBackDesign(): CardBackDesignId {
  return useContext(CardBackDesignContext).design;
}

export function CardBackPicker() {
  const { design: selected, onChange } = useContext(CardBackDesignContext);
  return (
    <div
      data-testid="card-back-picker"
      role="group"
      aria-label="Card back design"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
        gap: 10,
      }}
    >
      {cardBackDesigns.map((design) => {
        const active = design.id === selected;
        return (
          <button
            key={design.id}
            type="button"
            data-testid={`card-back-option-${design.id}`}
            aria-label={`${design.name}: ${design.description}`}
            aria-pressed={active}
            onClick={() => {
              onChange(design.id);
            }}
            style={{
              minWidth: 0,
              padding: 7,
              borderRadius: radius.control,
              border: `1px solid ${active ? color.focusBorder : color.border}`,
              background: active ? color.accentWash : color.controlFill,
              color: active ? color.textBright : color.textMuted,
              cursor: "pointer",
              boxShadow: active ? `0 0 0 1px ${color.accentBorder}` : "none",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "block",
                width: "100%",
                maxWidth: 48,
                aspectRatio: "7 / 10",
                margin: "0 auto 7px",
                border: `2px solid ${color.cardEdge}`,
                borderRadius: 4,
                boxShadow: "0 7px 14px -8px rgba(0,0,0,.9)",
                ...cardBackStyle(design.id, "thumbnail"),
              }}
            />
            <span
              style={{
                display: "block",
                overflow: "hidden",
                fontFamily: font.body,
                fontSize: fontSize.xs,
                fontWeight: 600,
                lineHeight: 1.2,
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {design.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
