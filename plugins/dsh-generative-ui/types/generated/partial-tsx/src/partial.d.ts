export type PartialTsxMode = "streaming" | "final";
export type PartialTsxOptions = {
    mode?: PartialTsxMode;
    synthesizeDefaultExport?: boolean;
};
export type NormalizeGeneratedTsxOptions = PartialTsxOptions & {
    preferredComponent?: string;
};
export declare const stripTsxMarkdownFence: (code: string) => string;
export declare function hasReactComponent(code: string): boolean;
export declare function completePartialTsx(code: string, options?: PartialTsxOptions): string;
export declare function normalizeGeneratedTsx(code: string, options?: NormalizeGeneratedTsxOptions): string;
/** Hosts may retain an already displayed implicit entry without treating a synthesized export as an explicit one. */
export declare function normalizeGeneratedTsxWithMetadata(code: string, options?: NormalizeGeneratedTsxOptions): {
    source: string;
    inferredComponent?: string;
};
