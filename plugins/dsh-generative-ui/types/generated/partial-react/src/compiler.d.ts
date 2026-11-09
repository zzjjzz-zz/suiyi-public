import { type RendererImportMap } from "./importMap";
export type CompileOptions = {
    importMap?: RendererImportMap;
    partial?: boolean;
    previousCode?: string;
    filename?: string;
    lang?: "ts" | "tsx" | "js" | "jsx";
    jsxImportSource?: string;
    synthesizeDefaultExport?: boolean;
    preferredComponent?: string;
    sourceMap?: boolean;
};
export type CompileResult = {
    code: string;
    source: string;
    changed: boolean;
    inferredComponent?: string;
};
export type TsxCompiler = {
    compile: (code: string, options?: CompileOptions) => Promise<CompileResult>;
};
export declare function createTsxCompiler(): TsxCompiler;
