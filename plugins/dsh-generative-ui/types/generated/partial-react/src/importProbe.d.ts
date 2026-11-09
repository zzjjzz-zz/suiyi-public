export type GenUIImportDiagnostic = {
    specifier: string;
    target: string;
    detail: string;
};
export declare class GenUIImportError extends Error {
    readonly diagnostics: GenUIImportDiagnostic[];
    constructor(diagnostics: GenUIImportDiagnostic[], cause: unknown);
}
export declare function probeModuleImports(code: string, imports?: Record<string, string>): Promise<GenUIImportDiagnostic[]>;
export declare function enrichModuleImportError(error: unknown, code: string, imports?: Record<string, string>): Promise<unknown>;
