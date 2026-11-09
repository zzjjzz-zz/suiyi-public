import { type TsxCompiler } from "./compiler";
import { type EsmShDependencyRanges, type ImportMapProvider } from "./importMap";
type EsmShModuleResponse = Pick<Response, "ok" | "status" | "statusText" | "text"> & {
    headers: Pick<Headers, "get">;
} & Partial<Pick<Response, "url">>;
export type EsmShModuleResolver = (url: string, imports: Readonly<Record<string, string>>) => Promise<string>;
type EsmShModuleResolverOptions = {
    baseUrl?: string;
    compiler?: TsxCompiler;
    fetch?: (url: string) => Promise<EsmShModuleResponse>;
    preload?: (url: string) => Promise<unknown> | unknown;
    createModuleUrl?: (code: string) => string;
};
export declare function createEsmShModuleResolver(options?: EsmShModuleResolverOptions): EsmShModuleResolver;
export declare function transformedEsmShFallback(options?: {
    external?: readonly string[];
    dev?: boolean;
    dependencyRanges?: EsmShDependencyRanges;
    baseUrl?: string;
    hasLocalPackage?: (packageName: string) => Promise<boolean>;
    resolveEsmSh?: EsmShModuleResolver;
    compiler?: TsxCompiler;
    fetch?: (url: string) => Promise<EsmShModuleResponse>;
    preload?: (url: string) => Promise<unknown> | unknown;
}): ImportMapProvider;
export declare const isRemoteSourceModuleSpecifier: (specifier: string) => boolean;
export declare function remoteModuleImportMap(options?: {
    baseUrl?: string;
    compiler?: TsxCompiler;
    fetch?: typeof fetch;
    dev?: boolean;
    dependencyRanges?: EsmShDependencyRanges;
    preloadEsmSh?: (url: string) => Promise<unknown> | unknown;
    resolveEsmSh?: EsmShModuleResolver;
}): ImportMapProvider;
export {};
