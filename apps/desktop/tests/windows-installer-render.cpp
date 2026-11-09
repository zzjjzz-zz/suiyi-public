// Exercises the shipped progress window without extracting or installing a payload.
// Interactive previews may supply the shipping locale's labels and five progress captions.
#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define NOMINMAX
#include <windows.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <utility>
#include <vector>

extern "C" __declspec(dllimport) HRESULT __cdecl InstallerApplyFrame(HWND window);
extern "C" __declspec(dllimport) HWND __cdecl InstallerShowProgress(HWND parent, HWND source,
    BOOL dark, UINT dpi, DWORD controlHover, DWORD controlPressed, const WCHAR* brand, const WCHAR* labels,
    const WCHAR* preparing, const WCHAR* extracting, const WCHAR* copying, const WCHAR* registering, const WCHAR* cleaning);
extern "C" __declspec(dllimport) BOOL __cdecl InstallerFinishProgress(HWND window);
extern "C" __declspec(dllimport) BOOL __cdecl InstallerMarkFailed(HWND window);
struct InstallerLayoutMetrics {
    UINT structSize;
    UINT version;
    UINT desktop;
    LONG width;
    LONG height;
    LONG cardX;
    LONG cardY;
    LONG cardW;
    LONG cardH;
    LONG cardRadius;
    LONG railX;
    LONG railY;
    LONG railW;
    LONG railH;
    LONG contentX;
    LONG contentY;
    LONG contentW;
    LONG pageTitleX;
    LONG pageTitleY;
    LONG pageTitleW;
    LONG pageTitleH;
    LONG pageSubtitleY;
    LONG stepX;
    LONG stepY;
    LONG stepGap;
    LONG stepSize;
    LONG stepLabelX;
    LONG stepLabelY;
    LONG stepLabelW;
    LONG stepLastW;
    LONG kickerY;
    LONG headingY;
    LONG descY;
    LONG markX;
    LONG markY;
    LONG markSize;
    LONG labelX;
    LONG labelY;
    LONG labelW;
    LONG trackY;
    LONG trackH;
    LONG logY1;
    LONG logY2;
    LONG footnoteX;
    LONG footnoteY;
    LONG footnoteW;
    LONG footnoteH;
    LONG failureX;
    LONG failureY;
    LONG failureHeadingX;
    LONG failureHeadingY;
    LONG failureDescY;
};
extern "C" __declspec(dllimport) BOOL __cdecl InstallerQueryLayout(UINT width, UINT height, UINT dpi, InstallerLayoutMetrics* out);
extern "C" __declspec(dllimport) HBITMAP __cdecl InstallerCreateBackdrop(UINT width, UINT height, UINT dpi, BOOL dark, int phase);
extern "C" __declspec(dllimport) BOOL __cdecl InstallerLoadFonts(LPCWSTR light, LPCWSTR regular, LPCWSTR medium);
extern "C" __declspec(dllimport) void __cdecl InstallerUnloadFonts(LPCWSTR light, LPCWSTR regular, LPCWSTR medium);
extern "C" __declspec(dllimport) BOOL __cdecl InstallerFontDiagnostics(
    WCHAR* light, UINT lightCount, WCHAR* regular, UINT regularCount,
    WCHAR* medium, UINT mediumCount, UINT* status);

static LRESULT CALLBACK WindowProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    if (message == WM_CLOSE || message == WM_DESTROY) {
        std::fprintf(stderr, "fixture_parent_message=%u\n", message);
    }
    if (message == WM_DESTROY) { PostQuitMessage(0); return 0; }
    return DefWindowProcW(window, message, wparam, lparam);
}

int wmain(int argc, wchar_t** argv) {
    if (argc < 12 || (argc > 13 && argc != 19)) {
        std::fprintf(stderr, "Usage: render-test.exe <brand-image> <dpi> <light|dark> <hover-argb> <pressed-argb> <page-argb> <card-argb> <accent-argb> <light-font> <regular-font> <medium-font> [interactive-title [labels preparing extracting copying registering cleaning]]\n");
        return 1;
    }
    const int dpi = _wtoi(argv[2]);
    if (dpi < 96 || dpi > 384) return 2;
    const bool dark = wcscmp(argv[3], L"dark") == 0;
    if (!dark && wcscmp(argv[3], L"light") != 0) return 2;
    wchar_t* end = nullptr;
    const DWORD hoverArgb = wcstoul(argv[4], &end, 0);
    if (!*argv[4] || *end || (hoverArgb >> 24) != 255) return 2;
    const DWORD pressedArgb = wcstoul(argv[5], &end, 0);
    if (!*argv[5] || *end || (pressedArgb >> 24) != 255) return 2;
    const DWORD pageArgb = wcstoul(argv[6], &end, 0);
    if (!*argv[6] || *end || (pageArgb >> 24) != 255) return 2;
    const DWORD cardArgb = wcstoul(argv[7], &end, 0);
    if (!*argv[7] || *end || (cardArgb >> 24) != 255) return 2;
    const DWORD accentArgb = wcstoul(argv[8], &end, 0);
    if (!*argv[8] || *end || (accentArgb >> 24) != 255) return 2;
    const WCHAR* lightFont = argv[9];
    const WCHAR* regularFont = argv[10];
    const WCHAR* mediumFont = argv[11];
    const bool interactive = argc > 12;
    const bool localizedPreview = argc == 19;
    SetProcessDPIAware();
    if (InstallerLoadFonts(lightFont, L"", mediumFont)) {
        std::fprintf(stderr, "Missing bundled face unexpectedly loaded\n");
        return 8;
    }
    if (!InstallerLoadFonts(lightFont, regularFont, mediumFont)) {
        std::fprintf(stderr, "Could not load the bundled UI fonts\n");
        return 8;
    }
    WCHAR lightFamily[LF_FACESIZE] = {};
    WCHAR regularFamily[LF_FACESIZE] = {};
    WCHAR mediumFamily[LF_FACESIZE] = {};
    UINT fontStatus = 0;
    const bool bundledFamilies = InstallerFontDiagnostics(
        lightFamily, ARRAYSIZE(lightFamily), regularFamily, ARRAYSIZE(regularFamily),
        mediumFamily, ARRAYSIZE(mediumFamily), &fontStatus)
        && fontStatus == 15
        && wcscmp(lightFamily, L"Noto Sans SC Light") == 0
        && wcscmp(regularFamily, L"Noto Sans SC") == 0
        && wcscmp(mediumFamily, L"Noto Sans SC Medium") == 0;
    std::printf("bundled_gdiplus_families=%d font_status=%u\n", bundledFamilies, fontStatus);
    if (!bundledFamilies) {
        InstallerUnloadFonts(lightFont, regularFont, mediumFont);
        return 8;
    }
    WNDCLASSW type = {};
    type.lpfnWndProc = WindowProc;
    type.hInstance = GetModuleHandleW(nullptr);
    type.lpszClassName = L"HarnessInstallerRenderTest";
    type.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    if (!RegisterClassW(&type)) return 3;
    WCHAR sizeValue[32] = {};
    int clientWidth = 600;
    int clientHeight = 844;
    if (GetEnvironmentVariableW(L"DSH_INSTALLER_WIDTH", sizeValue, ARRAYSIZE(sizeValue)) > 0) {
        clientWidth = _wtoi(sizeValue);
    }
    if (GetEnvironmentVariableW(L"DSH_INSTALLER_HEIGHT", sizeValue, ARRAYSIZE(sizeValue)) > 0) {
        clientHeight = _wtoi(sizeValue);
    }
    if (clientWidth < 320 || clientHeight < 480) return 2;
    HWND window = CreateWindowW(type.lpszClassName, interactive ? argv[12] : L"Installer rendering test",
        WS_POPUP | WS_SYSMENU | WS_MINIMIZEBOX, 100, 100,
        MulDiv(clientWidth, dpi, 96), MulDiv(clientHeight, dpi, 96), nullptr, nullptr, type.hInstance, nullptr);
    if (!window || FAILED(InstallerApplyFrame(window))) return 4;
    HWND stock = CreateWindowW(L"STATIC", L"", WS_CHILD | WS_VISIBLE, 0, 0, 1, 1, window, nullptr, type.hInstance, nullptr);
    HWND source = CreateWindowW(L"STATIC", L"", WS_CHILD, 0, 0, 1, 1, stock, nullptr, type.hInstance, nullptr);
    SetPropW(window, L"HarnessInstaller.Stage", reinterpret_cast<HANDLE>(1));
    SetPropW(window, L"HarnessInstaller.ExtractProgress", reinterpret_cast<HANDLE>(50));
    const WCHAR* labels = localizedPreview ? argv[13] : L"Step 3 - Install\nInstalling\nWriting application files.\nPrepare\nSetup\nInstall\nFinish\n"
        L"Location and options confirmed\nFiles are written only to the selected location\n"
        L"Progress shows the current stage, not the remaining time.\nInstallation did not finish\n"
        L"Installation did not finish. Close this installer and retry.\nInstall Suiyi\n"
        L"Installs for the current user. Administrator access is not required.\n"
        L"Choose the desktop platform\nConfirm the location and options\n"
        L"View installation progress\nStart the application and sign in\nSuiyi";
    const auto createProgress = [&]() {
        return InstallerShowProgress(window, source, dark, static_cast<UINT>(dpi), hoverArgb, pressedArgb, argv[1], labels,
            localizedPreview ? argv[14] : L"Preparing %d%%", localizedPreview ? argv[15] : L"Extracting %d%%",
            localizedPreview ? argv[16] : L"Copying %d%%", localizedPreview ? argv[17] : L"Registering %d%%",
            localizedPreview ? argv[18] : L"Cleaning %d%%");
    };
    ShowWindow(window, SW_SHOWNOACTIVATE);
    bool clientFrame = true;
    for (int x : {8, clientWidth / 2, clientWidth - 20}) {
        POINT point{MulDiv(x, dpi, 96), MulDiv(24, dpi, 96)};
        ClientToScreen(window, &point);
        clientFrame = SendMessageW(window, WM_NCHITTEST, 0, MAKELPARAM(point.x, point.y)) == HTCLIENT && clientFrame;
    }
    HWND failed = InstallerShowProgress(window, source, dark, static_cast<UINT>(dpi), hoverArgb, pressedArgb, L"", labels,
        L"Preparing %d%%", L"Extracting %d%%", L"Copying %d%%", L"Registering %d%%", L"Cleaning %d%%");
    ShowWindow(stock, SW_SHOW);
    const bool failurePreservesStock = !failed && IsWindowVisible(stock);
    if (failed) DestroyWindow(failed);
    // Warm retained font and window-animation resources before checking page-owned GDI objects.
    HWND warmup = createProgress();
    if (!warmup) { DestroyWindow(window); return 5; }
    UpdateWindow(warmup);
    ShowWindow(window, SW_MINIMIZE);
    ShowWindow(window, SW_RESTORE);
    UpdateWindow(warmup);
    DestroyWindow(warmup);
    // Warm the backdrop/card-shadow path as well; the measured backdrops below must not be
    // charged for first-use GDI+ caches. The finalGdi assertion stays unchanged.
    for (int cycle = 0; cycle < 2; ++cycle) {
        HBITMAP warmSetup = InstallerCreateBackdrop(MulDiv(clientWidth, dpi, 96), MulDiv(clientHeight, dpi, 96), static_cast<UINT>(dpi), dark, 0);
        HBITMAP warmFinish = InstallerCreateBackdrop(MulDiv(clientWidth, dpi, 96), MulDiv(clientHeight, dpi, 96), static_cast<UINT>(dpi), dark, 1);
        if (warmSetup) DeleteObject(warmSetup);
        if (warmFinish) DeleteObject(warmFinish);
    }
    const DWORD initialGdi = GetGuiResources(GetCurrentProcess(), GR_GDIOBJECTS);
    HWND progress = createProgress();
    if (!progress) { DestroyWindow(window); return 5; }
    UpdateWindow(progress);
    if (interactive) {
        MSG message;
        BOOL result;
        while ((result = GetMessageW(&message, nullptr, 0, 0)) > 0) {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        return result == 0 ? 0 : 7;
    }
    RECT originalBounds, restoredBounds;
    GetWindowRect(window, &originalBounds);
    const auto captionPixel = [&](int x) -> COLORREF {
        // Print into a private bitmap: visible-window clipping must not affect pixel assertions.
        HDC dc = CreateCompatibleDC(nullptr);
        BITMAPINFO info = {};
        info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        info.bmiHeader.biWidth = MulDiv(clientWidth, dpi, 96);
        info.bmiHeader.biHeight = -MulDiv(clientHeight, dpi, 96);
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        void* pixels = nullptr;
        HBITMAP bitmap = CreateDIBSection(nullptr, &info, DIB_RGB_COLORS, &pixels, nullptr, 0);
        if (!dc || !bitmap) {
            if (dc) DeleteDC(dc);
            if (bitmap) DeleteObject(bitmap);
            return CLR_INVALID;
        }
        HGDIOBJ previous = SelectObject(dc, bitmap);
        if (!previous) { DeleteObject(bitmap); DeleteDC(dc); return CLR_INVALID; }
        SendMessageW(progress, WM_PRINTCLIENT, reinterpret_cast<WPARAM>(dc), PRF_CLIENT);
        const COLORREF pixel = GetPixel(dc, MulDiv(x + 8, dpi, 96), MulDiv(24, dpi, 96));
        SelectObject(dc, previous);
        DeleteObject(bitmap);
        DeleteDC(dc);
        return pixel;
    };
    const auto colorref = [](DWORD argb) { return RGB((argb >> 16) & 255, (argb >> 8) & 255, argb & 255); };
    const COLORREF normalColor = colorref(pageArgb);
    const COLORREF hoverColor = colorref(hoverArgb);
    const COLORREF pressedColor = colorref(pressedArgb);
    // One reusable off-screen surface keeps the sample loop from masking a per-call GDI leak.
    HDC surfaceDc = CreateCompatibleDC(nullptr);
    BITMAPINFO surfaceInfo = {};
    surfaceInfo.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    surfaceInfo.bmiHeader.biWidth = MulDiv(clientWidth, dpi, 96);
    surfaceInfo.bmiHeader.biHeight = -MulDiv(clientHeight, dpi, 96);
    surfaceInfo.bmiHeader.biPlanes = 1;
    surfaceInfo.bmiHeader.biBitCount = 32;
    void* surfacePixels = nullptr;
    HBITMAP surfaceBitmap = CreateDIBSection(nullptr, &surfaceInfo, DIB_RGB_COLORS, &surfacePixels, nullptr, 0);
    HGDIOBJ surfacePrevious = surfaceDc && surfaceBitmap ? SelectObject(surfaceDc, surfaceBitmap) : nullptr;
    const bool surfaceReady = surfaceDc && surfaceBitmap && surfacePrevious && surfacePrevious != HGDI_ERROR;
    const auto surfacePixel = [&](int x, int y) -> COLORREF {
        if (!surfaceReady) return CLR_INVALID;
        SendMessageW(progress, WM_PRINTCLIENT, reinterpret_cast<WPARAM>(surfaceDc), PRF_CLIENT);
        return GetPixel(surfaceDc, MulDiv(x, dpi, 96), MulDiv(y, dpi, 96));
    };
    InstallerLayoutMetrics layout{};
    if (!InstallerQueryLayout(MulDiv(clientWidth, dpi, 96), MulDiv(clientHeight, dpi, 96), static_cast<UINT>(dpi), &layout)) {
        DestroyWindow(progress); DestroyWindow(window); return 6;
    }
    struct SurfaceSample { int x; int y; int kind; };
    const int accentX = static_cast<int>(layout.desktop
        ? layout.stepX + 4.0f
        : layout.stepX + 2.0f * layout.stepGap + 4.0f);
    const int accentY = static_cast<int>(layout.desktop
        ? layout.stepY + 2.0f * layout.stepGap + layout.stepSize / 2.0f
        : layout.stepY + layout.stepSize / 2.0f);
    const SurfaceSample surfaceSamples[] = {
        {8, 8, 0},
        {static_cast<int>(layout.cardX + layout.cardW - 20.0f), static_cast<int>(layout.cardY + 20.0f), 1},
        {accentX, accentY, 2},
    };
    bool surfaces = true;
    for (const SurfaceSample& sample : surfaceSamples) {
        const COLORREF expected = sample.kind == 0 ? colorref(pageArgb)
            : sample.kind == 1 ? colorref(cardArgb) : colorref(accentArgb);
        const COLORREF actual = surfacePixel(sample.x, sample.y);
        // The glass card composites over the scene; its channels must stay
        // within the alpha blend's bounds. Opaque page and accent stay exact.
        const auto glassChannel = [dark](BYTE foreground, BYTE observed) {
            const int alpha = dark ? 237 : 222;
            const int lower = foreground * alpha / 255;
            const int upper = (foreground * alpha + 255 * (255 - alpha) + 254) / 255;
            return observed >= lower && observed <= upper;
        };
        const bool matches = sample.kind == 1
            ? actual != CLR_INVALID
                && glassChannel(GetRValue(expected), GetRValue(actual))
                && glassChannel(GetGValue(expected), GetGValue(actual))
                && glassChannel(GetBValue(expected), GetBValue(actual))
            : actual == expected;
        if (!matches) {
            std::fprintf(stderr, "surface pixel x=%d y=%d expected=0x%08lx actual=0x%08lx\n",
                sample.x, sample.y, expected, actual);
            surfaces = false;
        }
    }
    if (surfacePrevious && surfacePrevious != HGDI_ERROR) SelectObject(surfaceDc, surfacePrevious);
    if (surfaceBitmap) DeleteObject(surfaceBitmap);
    if (surfaceDc) DeleteDC(surfaceDc);
    const auto expectPixel = [&](int x, COLORREF expected) {
        const COLORREF actual = captionPixel(x);
        if (actual != CLR_INVALID && actual == expected) return true;
        std::fprintf(stderr, "caption pixel x=%d dpi=%d expected=0x%08lx actual=0x%08lx\n", x, dpi, expected, actual);
        return false;
    };
    bool captionStates = true;
    ShowWindow(progress, SW_HIDE);
    for (int x : {clientWidth - 96, clientWidth - 52}) {
        const LPARAM point = MAKELPARAM(MulDiv(x + 20, dpi, 96), MulDiv(24, dpi, 96));
        captionStates = expectPixel(x, normalColor) && captionStates;
        SendMessageW(progress, WM_MOUSEMOVE, 0, point);
        captionStates = expectPixel(x, hoverColor) && captionStates;
        SendMessageW(progress, WM_LBUTTONDOWN, MK_LBUTTON, point);
        captionStates = expectPixel(x, pressedColor) && captionStates;
        const int other = x == clientWidth - 96 ? clientWidth - 52 : clientWidth - 96;
        SendMessageW(progress, WM_MOUSEMOVE, MK_LBUTTON, MAKELPARAM(MulDiv(other + 20, dpi, 96), MulDiv(24, dpi, 96)));
        captionStates = expectPixel(other, normalColor) && captionStates;
        captionStates = expectPixel(x, normalColor) && captionStates;
        SendMessageW(progress, WM_MOUSEMOVE, MK_LBUTTON, MAKELPARAM(-1, -1));
        captionStates = expectPixel(x, normalColor) && captionStates;
        SendMessageW(progress, WM_MOUSEMOVE, MK_LBUTTON, point);
        captionStates = expectPixel(x, pressedColor) && captionStates;
        SendMessageW(progress, WM_CANCELMODE, 0, 0);
        captionStates = expectPixel(x, hoverColor) && captionStates;
        SendMessageW(progress, WM_MOUSELEAVE, 0, 0);
        captionStates = expectPixel(x, normalColor) && captionStates;
    }
    ShowWindow(progress, SW_SHOW);
    const LPARAM minimizePoint = MAKELPARAM(MulDiv(clientWidth - 76, dpi, 96), MulDiv(24, dpi, 96));
    SendMessageW(progress, WM_LBUTTONDOWN, MK_LBUTTON, minimizePoint);
    bool buttonRelease = !IsIconic(window) && GetCapture() == progress;
    SendMessageW(progress, WM_LBUTTONUP, 0, MAKELPARAM(-1, -1));
    buttonRelease = buttonRelease && !IsIconic(window) && GetCapture() != progress;
    SendMessageW(progress, WM_LBUTTONDOWN, MK_LBUTTON, minimizePoint);
    ReleaseCapture();
    SendMessageW(progress, WM_LBUTTONUP, 0, minimizePoint);
    buttonRelease = buttonRelease && !IsIconic(window);
    SendMessageW(progress, WM_LBUTTONDOWN, MK_LBUTTON, minimizePoint);
    SendMessageW(progress, WM_CANCELMODE, 0, 0);
    SendMessageW(progress, WM_LBUTTONUP, 0, minimizePoint);
    buttonRelease = buttonRelease && !IsIconic(window) && GetCapture() != progress;
    SendMessageW(progress, WM_LBUTTONDOWN, MK_LBUTTON, minimizePoint);
    SendMessageW(progress, WM_LBUTTONUP, 0, minimizePoint);
    const bool minimized = IsIconic(window) != FALSE;
    ShowWindow(window, SW_RESTORE);
    GetWindowRect(window, &restoredBounds);
    const bool restored = !IsIconic(window) && EqualRect(&originalBounds, &restoredBounds);
    const LPARAM closePoint = MAKELPARAM(MulDiv(clientWidth - 32, dpi, 96), MulDiv(24, dpi, 96));
    MSG closeMessage;
    SendMessageW(progress, WM_LBUTTONDOWN, MK_LBUTTON, closePoint);
    bool closeRelease = !PeekMessageW(&closeMessage, window, WM_CLOSE, WM_CLOSE, PM_REMOVE);
    SendMessageW(progress, WM_LBUTTONUP, 0, minimizePoint);
    closeRelease = closeRelease && !PeekMessageW(&closeMessage, window, WM_CLOSE, WM_CLOSE, PM_REMOVE);
    SendMessageW(progress, WM_LBUTTONDOWN, MK_LBUTTON, closePoint);
    SendMessageW(progress, WM_LBUTTONUP, 0, closePoint);
    closeRelease = closeRelease && PeekMessageW(&closeMessage, window, WM_CLOSE, WM_CLOSE, PM_REMOVE);
    std::printf("fixture_alive_after_close_test parent=%d progress=%d\n", IsWindow(window), IsWindow(progress));
    LARGE_INTEGER frequency, started, finished;
    QueryPerformanceFrequency(&frequency);
    std::vector<double> samples;
    // Full repaint is the exposure/restore path; fixture startup is excluded.
    constexpr int frameCount = 300;
    for (int frame = 0; frame < frameCount; ++frame) {
        InvalidateRect(progress, nullptr, FALSE);
        QueryPerformanceCounter(&started);
        UpdateWindow(progress);
        QueryPerformanceCounter(&finished);
        samples.push_back(1000.0 * (finished.QuadPart - started.QuadPart) / frequency.QuadPart);
    }
    double total = 0;
    for (double sample : samples) total += sample;
    std::printf("samples_ms=[");
    for (size_t index = 0; index < samples.size(); ++index) {
        std::printf("%s%.3f", index ? "," : "", samples[index]);
    }
    std::printf("]\n");
    std::sort(samples.begin(), samples.end());
    std::printf("fixture=standalone-progress dpi=%d dark=%d frames=%d screen=%dx%d foreground=%d mean_ms=%.3f p50_ms=%.3f p95_ms=%.3f max_ms=%.3f\n",
        dpi, dark, frameCount, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN), GetForegroundWindow() == window,
        total / samples.size(), samples[samples.size() / 2], samples[samples.size() * 95 / 100], samples.back());
    std::printf("fixture_alive_after_frames parent=%d progress=%d\n", IsWindow(window), IsWindow(progress));
    const DWORD gdiBeforeBackdrop = GetGuiResources(GetCurrentProcess(), GR_GDIOBJECTS);
    HBITMAP setupBackdrop = InstallerCreateBackdrop(MulDiv(clientWidth, dpi, 96), MulDiv(clientHeight, dpi, 96), static_cast<UINT>(dpi), dark, 0);
    HBITMAP finishBackdrop = InstallerCreateBackdrop(MulDiv(clientWidth, dpi, 96), MulDiv(clientHeight, dpi, 96), static_cast<UINT>(dpi), dark, 1);
    const bool backdropCreated = setupBackdrop != nullptr && finishBackdrop != nullptr;
    if (setupBackdrop) DeleteObject(setupBackdrop);
    if (finishBackdrop) DeleteObject(finishBackdrop);
    const DWORD gdiAfterBackdrop = GetGuiResources(GetCurrentProcess(), GR_GDIOBJECTS);
    const ULONGLONG finishStarted = GetTickCount64();
    const BOOL finishReturned = InstallerFinishProgress(progress);
    const auto completedPercent = reinterpret_cast<UINT_PTR>(GetPropW(window, L"HarnessInstaller.CompletedPercent"));
    const bool completed = finishReturned && completedPercent == 100;
    WCHAR caption[160] = {};
    GetWindowTextW(progress, caption, ARRAYSIZE(caption));
    MSG quitMessage{};
    std::printf("finish_diagnostic returned=%d elapsed=%llu parent=%d progress=%d visible=%d iconic=%d completed_percent=%llu quit_pending=%d\n",
        finishReturned, GetTickCount64() - finishStarted, IsWindow(window), IsWindow(progress),
        IsWindowVisible(progress), IsIconic(window), static_cast<unsigned long long>(completedPercent),
        PeekMessageW(&quitMessage, nullptr, WM_QUIT, WM_QUIT, PM_NOREMOVE));
    std::printf("finish_caption=%ls\n", caption);
    const bool finalCaption = wcscmp(caption, L"Extracting 100%") == 0;
    DestroyWindow(progress);
    bool occludedCompletion = true;
    if (clientWidth == 1280 && clientHeight == 800 && dpi == 96 && !dark) {
        for (int presentation : {SW_HIDE, SW_MINIMIZE}) {
            RemovePropW(window, L"HarnessInstaller.CompletedPercent");
            RemovePropW(window, L"HarnessInstaller.Succeeded");
            HWND occluded = createProgress();
            if (!occluded) { occludedCompletion = false; break; }
            UpdateWindow(occluded);
            ShowWindow(presentation == SW_HIDE ? occluded : window, presentation);
            const BOOL returned = InstallerFinishProgress(occluded);
            WCHAR finalText[160] = {};
            GetWindowTextW(occluded, finalText, ARRAYSIZE(finalText));
            const bool reached = GetPropW(window, L"HarnessInstaller.CompletedPercent") == reinterpret_cast<HANDLE>(100);
            const bool labeled = wcscmp(finalText, L"Extracting 100%") == 0;
            std::printf("occluded_finish presentation=%d returned=%d completed=%d caption=%d parent=%d progress=%d\n",
                presentation, returned, reached, labeled, IsWindow(window), IsWindow(occluded));
            occludedCompletion = returned && reached && labeled && occludedCompletion;
            ShowWindow(window, SW_RESTORE);
            ShowWindow(occluded, SW_SHOW);
            UpdateWindow(occluded);
            DestroyWindow(occluded);
        }
        RemovePropW(window, L"HarnessInstaller.CompletedPercent");
        RemovePropW(window, L"HarnessInstaller.Succeeded");
        HWND failedProgress = createProgress();
        const bool failureRejected = failedProgress && InstallerMarkFailed(failedProgress)
            && !InstallerFinishProgress(failedProgress)
            && GetPropW(window, L"HarnessInstaller.CompletedPercent") != reinterpret_cast<HANDLE>(100);
        std::printf("failed_finish_rejected=%d\n", failureRejected);
        occludedCompletion = failureRejected && occludedCompletion;
        if (failedProgress) DestroyWindow(failedProgress);
    }
    const DWORD finalGdi = GetGuiResources(GetCurrentProcess(), GR_GDIOBJECTS);
    DestroyWindow(window);
    InstallerUnloadFonts(lightFont, regularFont, mediumFont);
    const bool fontsReleased = !InstallerFontDiagnostics(
        lightFamily, ARRAYSIZE(lightFamily), regularFamily, ARRAYSIZE(regularFamily),
        mediumFamily, ARRAYSIZE(mediumFamily), &fontStatus) && fontStatus == 0;
    std::printf("bundled_fonts_released=%d\n", fontsReleased);
    std::printf("client_frame=%d stock_preserved=%d completed=%d final_caption=%d caption_states=%d surfaces=%d backdrop_created=%d button_release=%d close_release=%d minimized=%d restored=%d gdi_before=%lu gdi_after=%lu gdi_backdrop_before=%lu gdi_backdrop_after=%lu\n",
        clientFrame, failurePreservesStock, completed, finalCaption, captionStates, surfaces, backdropCreated, buttonRelease, closeRelease, minimized, restored, initialGdi, finalGdi, gdiBeforeBackdrop, gdiAfterBackdrop);
    return clientFrame && failurePreservesStock && completed && finalCaption && occludedCompletion && captionStates && surfaces && backdropCreated
        && buttonRelease && closeRelease && minimized && restored && fontsReleased && finalGdi <= initialGdi ? 0 : 6;
}
