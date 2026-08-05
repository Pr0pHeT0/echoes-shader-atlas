export interface FontDefinition {
  family: string;
  weight: number;
  source: string;
  descriptorWeight: string;
}

interface LoadedFontFace {
  load(): Promise<LoadedFontFace>;
}

interface FontFaceConstructor {
  new (
    family: string,
    source: string,
    descriptors: { weight: string; style: string },
  ): LoadedFontFace;
}

export interface FontLoadingEnvironment {
  FontFace: FontFaceConstructor;
  fonts: {
    add(face: LoadedFontFace): void;
    load(font: string): Promise<unknown>;
  };
}

function browserFontEnvironment(): FontLoadingEnvironment | undefined {
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts) return undefined;
  return {
    FontFace: FontFace as unknown as FontFaceConstructor,
    fonts: document.fonts as unknown as FontLoadingEnvironment["fonts"],
  };
}

/** Loads optional showcase fonts without preventing the canvas fallback font from rendering. */
export async function loadFontFacesWithFallback(
  definitions: readonly FontDefinition[],
  environment = browserFontEnvironment(),
): Promise<boolean> {
  if (!environment) return false;
  try {
    await Promise.all(definitions.map(async (definition) => {
      const face = new environment.FontFace(
        definition.family,
        `url("${definition.source}")`,
        { weight: definition.descriptorWeight, style: "normal" },
      );
      const loaded = await face.load();
      environment.fonts.add(loaded);
      await environment.fonts.load(`${definition.weight} 16px "${definition.family}"`);
    }));
    return true;
  } catch {
    return false;
  }
}
