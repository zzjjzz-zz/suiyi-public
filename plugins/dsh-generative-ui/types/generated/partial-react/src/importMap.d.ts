export type RendererImportMap = {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
    styles?: string[];
};
export type ImportMapProviderContext = {
    code: string;
    missing: string[];
    imports?: Readonly<Record<string, string>>;
};
export type ImportMapProvider = {
    kind?: "base" | "fallback";
    prefetch?: () => Promise<unknown> | void;
    resolve: (context: ImportMapProviderContext) => RendererImportMap | Promise<RendererImportMap>;
};
export declare const RUNTIME_SINGLETON_SPECIFIERS: readonly ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "scheduler"];
export type RuntimeSingletonSpecifier = (typeof RUNTIME_SINGLETON_SPECIFIERS)[number];
export declare const isRuntimeSingletonSpecifier: (specifier: string) => specifier is RuntimeSingletonSpecifier;
export declare const isRuntimeSingletonImportMapKey: (specifier: string) => boolean;
export declare const isBareModuleSpecifier: (specifier: string) => boolean;
export declare const getBarePackageName: (specifier: string) => string;
export declare const isSharedInstancePackage: (specifier: string) => boolean;
export declare const isLocalRootRelativeTarget: (target: string) => boolean;
export declare const canUseEsmShFallback: (specifier: string) => boolean;
export type ResolutionSite = "import" | "meta-resolve";
export declare const extractSpecifiersByKind: <const K extends string>(code: string, kinds: readonly K[], classify: (specifier: string, site: ResolutionSite) => NoInfer<K> | undefined) => Record<K, Set<string>>;
export declare const extractBareModuleSpecifiers: (code: string) => Set<string>;
export declare const extractImportSpecifiers: (code: string) => Set<string>;
export declare const extractImportMetaResolveSpecifiers: (code: string) => Set<string>;
export declare const extractModuleSpecifiers: (code: string) => Set<string>;
export declare function resolveImportMapSpecifier(imports: Readonly<Record<string, string>>, specifier: string): string | undefined;
export declare const rewriteImportMetaResolveSpecifiers: (code: string, imports: Readonly<Record<string, string>>, edits?: {
    end: number;
    delta: number;
}[]) => string;
export declare const rewriteImportSpecifiers: (code: string, imports: Readonly<Record<string, string>>) => string;
export declare const extractImportRequests: (code: string) => (readonly [string, {
    readonly names: readonly string[];
    readonly attributes: Record<string, string> | undefined;
}])[];
export declare const extractImportBindings: (code: string) => Map<string, {
    readonly names: readonly string[];
    readonly attributes: Record<string, string> | undefined;
}>;
export declare const extractImportedExportNames: (code: string) => Map<string, readonly string[]>;
export declare function hasImportMapEntry(imports: Record<string, string> | Set<string> | Map<string, string>, specifier: string): boolean;
export declare const overlayImportMaps: (base: Record<string, string> | undefined, overlay: Record<string, string> | undefined) => {
    [x: string]: string;
};
export type EsmShDependencyRanges = Readonly<Record<string, string>>;
type EsmShImportUrlOptions = {
    dev?: boolean;
    dependencyRanges?: EsmShDependencyRanges;
};
export declare function toEsmShImportUrl(specifier: string, external?: readonly string[], options?: EsmShImportUrlOptions): string;
type EsmShPreloadFetch = (url: string) => Promise<Pick<Response, "ok" | "status">>;
type EsmShPreloadOptions = {
    fetch?: EsmShPreloadFetch;
    attempts?: number;
};
export declare function preloadEsmShImportUrl(url: string, options?: EsmShPreloadOptions): Promise<void>;
export type EsmShProbe = {
    alive: true;
} | {
    alive: false;
    detail: string;
};
type EsmShProbeFetch = (url: string) => Promise<Pick<Response, "ok" | "status" | "text" | "json">>;
export declare const probeEsmShSpecifier: (specifier: string, fetcher?: EsmShProbeFetch) => Promise<EsmShProbe | null>;
export declare const probeRemoteModuleUrl: (url: string, fetcher?: EsmShProbeFetch) => Promise<EsmShProbe>;
export declare const probeImportSpecifier: (specifier: string, fetcher?: EsmShProbeFetch) => Promise<EsmShProbe | null>;
export declare function prepareRendererImportMap(map: RendererImportMap | null | undefined, baseUrl?: string | undefined): {
    styles?: string[] | undefined;
    scopes?: {
        [k: string]: {
            [k: string]: string;
        };
    } | undefined;
    imports: {
        [k: string]: string;
    };
};
export declare function literalImportMap(map: RendererImportMap): ImportMapProvider;
export declare function urlImportMap(source: string, options?: {
    kind?: ImportMapProvider["kind"];
    fetch?: (source: string) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;
}): ImportMapProvider;
export declare function packageImportMap(packageName: string, options?: {
    resolve?: (name: string) => string;
}): ImportMapProvider;
export declare function esmShFallback(options?: {
    external?: readonly string[];
    dev?: boolean;
    dependencyRanges?: EsmShDependencyRanges;
    hasLocalPackage?: (packageName: string) => Promise<boolean>;
}): ImportMapProvider;
export declare function createImportMapResolver(providers: ImportMapProvider[]): {
    prefetch: () => Promise<undefined>;
    resolve({ code }?: {
        code?: string;
    }): Promise<{
        styles?: string[] | undefined;
        scopes?: Record<string, Record<string, string>> | undefined;
        imports: Record<string, string>;
    }>;
};
export declare function mergeFallbackImports(imports: Record<string, string>, code: string, options?: {
    dependencyRanges?: EsmShDependencyRanges;
    hasLocalPackage?: (packageName: string) => Promise<boolean>;
}): Promise<Record<string, string>>;
export {};
