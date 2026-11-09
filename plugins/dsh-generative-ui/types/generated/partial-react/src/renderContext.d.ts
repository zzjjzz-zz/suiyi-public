import { type Context } from "react";
export type GenUIRenderContextValue = {
    rendererScope: string;
    streamingPartialFrame: boolean;
    nextStreamingRenderKey?: () => string;
};
export declare const getGenUIRenderContextValue: (streamingPartialFrame: boolean, rendererScope?: string, nextStreamingRenderKey?: () => string) => GenUIRenderContextValue;
export declare const GenUIRenderContext: Context<GenUIRenderContextValue>;
export declare const useGenUIRenderContext: () => GenUIRenderContextValue;
