import { type ComponentType, type ReactNode } from "react";
export type GeneratedFunctionComponent = (props: Record<string, unknown>) => ReactNode | Promise<ReactNode>;
export type GeneratedComponent = ComponentType<Record<string, unknown>> | GeneratedFunctionComponent;
export type GeneratedComponentSlot = {
    Component: GeneratedFunctionComponent;
    current: () => GeneratedComponent | null;
    lastGood: () => GeneratedComponent | null;
    setCurrent: (component: GeneratedComponent) => void;
    markRendered: (component?: GeneratedComponent | null) => void;
    restoreLastGood: () => boolean;
    clear: () => void;
};
export declare function createGeneratedComponentSlot(): GeneratedComponentSlot;
