/** Operations available to the isolated native welcome renderer. */

import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { ProductEventMap } from '@deepseek-ai/dsh-client-product-analytics/types'
import type { DesktopLocale } from './locale.ts'

/** Private native welcome channels, installed only while its window exists. */
export const WELCOME_IPC = {
  saveApiKey: 'dsh-welcome:save-api-key',
  analytics: 'dsh-welcome:analytics',
  analyticsEnabled: 'dsh-welcome:analytics-enabled',
  skip: 'dsh-welcome:skip',
  start: 'dsh-welcome:start',
  cancel: 'dsh-welcome:cancel',
  copyLink: 'dsh-welcome:copy-link',
  state: 'dsh-welcome:state',
  takeNotice: 'dsh-welcome:take-notice',
  suiyiStart: 'dsh-welcome:suiyi-start',
  suiyiCancel: 'dsh-welcome:suiyi-cancel',
  suiyiCopyLink: 'dsh-welcome:suiyi-copy-link',
  suiyiState: 'dsh-welcome:suiyi-state',
  suiyiReturn: 'dsh-welcome:suiyi-return',
} as const

/** Credential writes return a safe outcome without exposing Host diagnostics. */
export type WelcomeSaveResult = { readonly ok: true } | { readonly ok: false }

/** One-time notification retained by the main process until Welcome receives it. */
export type WelcomeNotice = 'session-expired'

type WelcomeEventName = 'auth_page_view' | 'auth_page_click' | 'api_key_save_click'

/** Host-owned operations used by the welcome window. */
export interface WelcomeOperations {
  /** @param eventName - allowed welcome event. @param attributes - approved fields without credentials. */
  analytics?<K extends WelcomeEventName>(eventName: K, attributes: ProductEventMap[K]): Promise<void>
  /** @returns the Host's current effective collection policy. */
  analyticsEnabled(): Promise<boolean>
  /** @returns the pending notification, clearing it before another renderer can receive it. */
  takeNotice(): Promise<WelcomeNotice | undefined>
  /** @returns account state after starting a login attempt. */
  startSignIn(): Promise<AccountView>
  /** @param id - attempt to cancel. @returns the settled state. */
  cancelSignIn(id: SignInAttemptId): Promise<AccountView>
  /** @param id - current waiting attempt whose authorization URL is copied to the system clipboard. */
  copySignInLink(id: SignInAttemptId): Promise<void>

  /**
   * Store the official provider's key before entering the workspace.
   * @param value - validated, trimmed API key.
   * @returns whether the write completed, without private error details.
   */
  saveApiKey(value: string): Promise<WelcomeSaveResult>
  /**
   * Enter the workspace without writing an onboarding-completion setting.
   * @returns completion after the workspace opens.
   */
  skip(): Promise<void>
}

/** Reason a Suiyi identity-center login attempt did not complete; never carries tokens or provider detail. */
export type SuiyiLoginFailure =
  /** Discovery or token endpoint could not be reached. */
  | 'unreachable'
  /** The configured issuer or its discovery document is unusable. */
  | 'configuration'
  /** The user closed the authorization page before finishing. */
  | 'cancelled'
  /** The loopback callback did not arrive before the login deadline. */
  | 'timeout'
  /** The identity center returned an invalid or rejected token. */
  | 'rejected'
  /** The attempt failed without a classified provider result. */
  | 'unknown'

/** Presentation state of the Suiyi Keycloak login window. */
export interface SuiyiLoginView {
  /** Ready shows the entry; working waits for the browser; error offers retry; success precedes the workspace. */
  readonly phase: 'ready' | 'working' | 'error' | 'success'
  /** Current browser authorization address; present while a working attempt can still be completed manually. */
  readonly authorizeUrl?: string
  /** Classified failure while `phase` is `error`. */
  readonly failure?: SuiyiLoginFailure
}

/** Authorization-code login operations the Suiyi login window requests from the shell. */
export interface SuiyiLoginOperations {
  /** Start one Keycloak authorization-code login in the system browser; the next view arrives through `onState`. */
  start(): Promise<void>
  /** Abandon the active attempt and present the ready view again. */
  cancel(): Promise<void>
  /** Copy the active authorization address to the system clipboard. */
  copyLink(): Promise<void>
}

/** Suiyi login face: shell operations plus the host-pushed presentation state. */
export type SuiyiLoginApi = SuiyiLoginOperations & {
  /** @param listener - presentation-state recipient. @returns subscription disposer. */
  onState(listener: (view: SuiyiLoginView) => void): () => void
}

/** Official welcome window face: localized copy, account operations, and safe account snapshots. */
export interface OfficialWelcomeApi extends DesktopLocale, WelcomeOperations {
  /** @param listener - safe account snapshot recipient. @returns subscription disposer. */
  onAccountState(listener: (state: AccountView) => void): () => void
  /** Omitted in the official window; present only in the Suiyi login window. */
  readonly suiyi?: undefined
}

/** Authenticated welcome revisit; its only operation closes this window. */
export interface SuiyiReturnApi {
  /** Return to the existing workspace without changing authentication or Session state. */
  returnToWorkspace(): Promise<void>
}

/** Suiyi login or authenticated welcome window, with localized copy. */
export interface SuiyiWelcomeApi extends DesktopLocale {
  readonly suiyi: SuiyiLoginApi | SuiyiReturnApi
}

/**
 * One of the two welcome window faces. The shell exposes exactly one member because the Suiyi
 * login window must not carry account or API-key operations, and the official window must not
 * render a Keycloak attempt it cannot drive.
 */
export type WelcomeApi = OfficialWelcomeApi | SuiyiWelcomeApi

/** Authentication facts supplied at cold start or after a completed sign-out. */
export interface WelcomeAuthentication {
  readonly loggedIn: boolean
  readonly hasApiKey: boolean
}

/**
 * Decide whether a startup or sign-out requires the welcome entry.
 * @param authentication - current account and independently stored API-key facts.
 * @returns true only when neither authentication route is configured.
 */
export function needsWelcome(authentication: WelcomeAuthentication): boolean {
  return !authentication.loggedIn && !authentication.hasApiKey
}
