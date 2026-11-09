export declare class ModuleErrors {
    private modules;
    remember(url: string, code: string, withMap: () => Promise<string>): void;
    clear(): void;
    map(error: Error): Error | Promise<Error>;
    private mapFrames;
}
