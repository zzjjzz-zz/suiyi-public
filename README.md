# Suiyi · Public source snapshot

English | [中文](README.zh.md)

This is an **independent public source snapshot** of Suiyi, used to build
Windows x64 **unsigned** NSIS test installers on GitHub Actions `windows-2025` runners. It contains no private development repository history and is not a formal release.

## Baseline

- Private source commit: `d9ba3ec471177ff4f3ba295d9ce7f54b623e7795`
- Export method: run `git archive --format=tar HEAD` in a clean private worktree
- This repository starts from an independent root commit; subsequent commits update reviewed public snapshots without private Git history
- This repository maintains `main` as its public build branch; development takes place in the private repository, with reviewed source snapshots exported for updates
- Public exports retain links to excluded internal files as plain text and regenerate bilingual pairing records against the public file set
- The public snapshot retains the Windows packaging sources in `apps/`, `packages/`, `plugins/`, `native/`,
  `vendor/`, `python/`, `scripts/`, `patches/`, and complete lockfiles
- Exclusions include `.agents/`, `snapshots/`, `docs/`, `website/`, `benchmarks/`, private `.github/`
  workflows, internal agent instructions, session records, and internal release scripts
- Tests and documentation scripts that depend on those session snapshots or documentation sites are excluded to avoid publishing snapshot content; Windows packaging
  sources, lockfiles, and the workflow remain complete
- Plugin test seed `.env` files and plugin integration documents containing private absolute paths are removed
- The public Suiyi build uses the default OIDC identity provider
  `https://sso.zzjjzz.top/realms/identity`; this address is public service metadata and contains no authentication keys
- The root `LICENSE` and original third-party licenses are retained; this snapshot does not claim a complete legal review of third-party licenses

## Download test installers

1. Open this repository's **Actions** page.
2. Select the latest successful **Build Windows x64 NSIS (unsigned)** workflow run.
3. Download the following archive from that run's **Artifacts**:
   `suiyi-windows-x64-unsigned-<run_number>-<run_attempt>`.
4. Artifacts are retained for **14 days** and contain the installer and `SHA256SUMS.txt`.

The installer filename depends on the build version:

```text
suiyi-<build-version>-win-x64-unsigned.exe
SHA256SUMS.txt
```

The workflow checks the PE machine type `x64` (`0x8664`), a minimum file size, and
that `Get-AuthenticodeSignature` reports `NotSigned`. **Packaging succeeds only when the GitHub Actions run
and artifact upload both succeed.**

## Build configuration

- Runner: `windows-2025`
- Node.js `24`
- pnpm `11.28.5` (pinned by `packageManager` in the root `package.json`)
- Dependency installation: `pnpm install --frozen-lockfile`
- Preflight: `pnpm run package:desktop:win:x64:unsigned --check --build-version <version>`
- Build: `pnpm run package:desktop:win:x64:unsigned --build-version <version>`
- `DSH_DESKTOP_FLAVOR=suiyi`
- `DSH_DESKTOP_APP_ID=com.zzjjzz.suiyi`
- `DSH_DESKTOP_AUTO_UPDATE_ENV=test`
- `DSH_DESKTOP_WINDOWS_PACK_CONCURRENCY=2`
- `DSH_DESKTOP_WINDOWS_COMPRESSION_LEVEL=3`
- `DSH_TELEMETRY_DISABLED=1`
- Reserved test policy domain: `https://policy.example.invalid`; identity provider: `https://sso.zzjjzz.top/realms/identity`
- Permissions: only `contents: read`
- Triggers: only `push` to `main` and manual `workflow_dispatch`
- No `pull_request_target`, private checkout, token, self-hosted runner, or production keys

## Security limits

- **Unsigned and without formal release acceptance.** Windows may show a SmartScreen warning; this installer must not be described as
  signed, production-ready, or accepted against a real identity provider.
- The public build includes a real HTTPS identity provider address, which makes the login service discoverable; **account authorization and desktop login acceptance are not guaranteed**.
  The identity provider must still allow the `suiyi-desktop` client's authorization code flow and local callback; future service address changes
  can override the default with `suiyi-oidc-issuer.json` without adding keys to the public repository.
- The workflow builds and checks PE metadata, size, signature status, and SHA-256; it does not perform real SSO login or replace
  independent Windows installation and runtime acceptance.
- This public repository does not upload installers to releases, object storage, or an automatic update service.
- Build outputs are test artifacts and must not be distributed as formal releases.

## Scan record

The following scan ran in the export directory before publication:

```text
gitleaks 8.30.1 dir . --redact --gitleaks-ignore-path .gitleaksignore
```

Text scans also checked for local home directory paths, private domains, private repository paths, private key blocks, common cloud token formats, and internal RFC 1918
addresses. Five initial Gitleaks matches were in test fixtures and
compressed code in `patches/lexical@0.49.0.patch`; none contained real credentials. Their fingerprints are recorded in
`.gitleaksignore`, without broad directory or rule exemptions. The final scan found no real secrets.

A passing scan does not constitute an exhaustive audit of third-party code, assets, or dependency licenses. If real secrets or sensitive data are found,
stop publication and report through the repository's private security channel; do not paste secret values into public issues.

## License

The root project uses MIT; see [`LICENSE`](LICENSE). Components in `vendor/` retain upstream MIT licenses;
`plugins/dsh-generative-ui/` retains its Apache-2.0 `LICENSE` and `NOTICE`; other third-party dependencies
remain subject to their own licenses. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), package license
files, and lockfiles. This snapshot makes no final legal determination of complete license compliance.
