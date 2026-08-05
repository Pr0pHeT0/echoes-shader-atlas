import simplexNoise4d from "./shared/simplex-noise-4d.glsl?raw";

const SIMPLEX_INCLUDES = [
  "#include ../includes/simplexNoise4d.glsl",
  "#include ./includes/simplexNoise4d.glsl",
] as const;

/** Resolve the one source-local GLSL include without adding a build plugin. */
export function composeShader(source: string): string {
  return SIMPLEX_INCLUDES.reduce(
    (composed, directive) => composed.replaceAll(directive, simplexNoise4d),
    source,
  );
}
