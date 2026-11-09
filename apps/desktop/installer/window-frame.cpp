// Keeps the DWM frame and shadow while the NSIS page owns the entire client area.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define UNICODE
#include <windows.h>
#include <tlhelp32.h>
#include <objidl.h>
#include <commctrl.h>
#include <dwmapi.h>
#ifdef GDIPVER
#undef GDIPVER
#endif
#define GDIPVER 0x0110
#include <gdiplus.h>
#include <gdipluseffects.h>
#include <algorithm>
#include <new>
#include <string>
#include <vector>
#include <array>
#include <cmath>
#include "progress.h"
#include "extract.h"
#include "extract-report.h"
#include "directory-report.h"
#include "uninstall-data.h"

using namespace Gdiplus;

// Returns whether the UTF-8 report was saved; failure still presents the original error unless silent.
extern "C" __declspec(dllexport) int __cdecl InstallerReportDirectoryFailure(
    HWND parent, DWORD error, LPCWSTR source, LPCWSTR destination, DWORD restoreError, LPCWSTR backup,
    LPCWSTR log, LPCWSTR reportPath, int show, LPCWSTR title, LPCWSTR heading, LPCWSTR hint, LPCWSTR copy,
    LPCWSTR expand, LPCWSTR collapse, LPCWSTR savedFormat, LPCWSTR unsaved, LPCWSTR copied) {
    try {
        const std::wstring report = directory_report::Compose(error, source, destination, restoreError, backup, extract_report::ReadOutput(log));
        const bool saved = extract_report::WriteUtf8(reportPath, report);
        if (show) {
            std::wstring footer = saved ? savedFormat : unsaved;
            const auto placeholder = footer.find(L"%s");
            if (saved && placeholder != std::wstring::npos) footer.replace(placeholder, 2, reportPath);
            const extract_report::DialogStrings strings{title, heading, copy, expand, collapse, footer.c_str(), copied};
            const std::wstring content = directory_report::Content(error, hint, restoreError, backup);
            extract_report::Show(parent, content, extract_report::BoundedExcerpt(extract_report::Lines(extract_report::Trim(report))), report, strings);
        }
        return saved ? 1 : 0;
    } catch (const std::bad_alloc&) {
        if (show) MessageBoxW(parent, hint, heading, MB_OK | MB_ICONEXCLAMATION);
        return 0;
    }
}

// Saves the extraction failure report and, unless silent, presents its headline with a copy action.
// Returns 1 when the report file was written and 0 otherwise; the dialog outcome never fails the caller.
extern "C" __declspec(dllexport) int __cdecl InstallerReportExtractFailure(
    HWND parent, int code, LPCWSTR archive, LPCWSTR destination, LPCWSTR log, LPCWSTR reportPath, int show,
    LPCWSTR title, LPCWSTR heading, LPCWSTR hint, LPCWSTR copy, LPCWSTR expand, LPCWSTR collapse, LPCWSTR savedFormat, LPCWSTR unsaved, LPCWSTR copied) {
    try {
        const std::wstring output = extract_report::ReadOutput(log);
        const std::wstring report = extract_report::Compose(code, archive, destination, output,
            extract_report::Timestamp(), extract_report::WindowsVersion());
        const bool saved = extract_report::WriteUtf8(reportPath, report);
        if (show) {
            std::wstring footer = saved ? savedFormat : unsaved;
            const auto placeholder = footer.find(L"%s");
            if (saved && placeholder != std::wstring::npos) footer.replace(placeholder, 2, reportPath);
            const extract_report::DialogStrings strings{title, heading, copy, expand, collapse, footer.c_str(), copied};
            const std::wstring content = extract_report::Headline(code, output, archive) + L"\r\n\r\n" + hint;
            extract_report::Show(parent, content, extract_report::Excerpt(report), report, strings);
        }
        return saved ? 1 : 0;
    } catch (const std::bad_alloc&) {
        return 0;
    }
}

// Returns a Win32 error code; no cleanup request may traverse a linked root or touch the protected root.
extern "C" __declspec(dllexport) DWORD __cdecl UninstallRemoveData(LPCWSTR path, LPCWSTR installation, LPCWSTR protectedRoot) {
    return uninstall_data::Remove(path, installation, protectedRoot);
}

// Returns a Win32 error code; only ordinary empty directories strictly below the stop directory are removed.
extern "C" __declspec(dllexport) DWORD __cdecl UninstallRemoveEmptyParents(LPCWSTR path, LPCWSTR stop) {
    return uninstall_data::RemoveEmptyParents(path, stop);
}

// Match the affected executable, not another user's or directory's same-named application.
// Returns 0 while running, 1 when absent, and -1 if the process list cannot be read.
extern "C" __declspec(dllexport) int __cdecl InstallerFindProcess(LPCWSTR executable) {
    WCHAR target[32768];
    DWORD length = GetLongPathNameW(executable, target, ARRAYSIZE(target));
    LPCWSTR expected = length > 0 && length < ARRAYSIZE(target) ? target : executable;
    LPCWSTR filename = wcsrchr(expected, L'\\');
    filename = filename ? filename + 1 : expected;
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) return -1;
    PROCESSENTRY32W entry = {};
    entry.dwSize = sizeof(entry);
    int result = 1;
    BOOL present = Process32FirstW(snapshot, &entry);
    while (present) {
        if (_wcsicmp(entry.szExeFile, filename) == 0) {
            HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, entry.th32ProcessID);
            if (process) {
                WCHAR path[32768];
                DWORD count = ARRAYSIZE(path);
                if (QueryFullProcessImageNameW(process, 0, path, &count) && _wcsicmp(path, expected) == 0) result = 0;
                CloseHandle(process);
                if (result == 0) break;
            }
        }
        present = Process32NextW(snapshot, &entry);
    }
    if (!present && GetLastError() != ERROR_NO_MORE_FILES) result = -1;
    CloseHandle(snapshot);
    return result;
}

// Palette owner for painted surfaces. Keep in sync with installer/theme.nsh; the
// native theme check compares these constants with the theme.nsh values.
constexpr ARGB kLightBg = 0xFFEDF5FF;
constexpr ARGB kDarkBg = 0xFF061122;
constexpr ARGB kLightCard = 0xFFFFFFFF;
constexpr ARGB kDarkCard = 0xFF16263A;
constexpr ARGB kLightField = 0xFFF6F8FC;
constexpr ARGB kDarkField = 0xFF1B3049;
constexpr ARGB kLightFieldBorder = 0xFFD7E2F0;
constexpr ARGB kDarkFieldBorder = 0xFF33475F;
constexpr ARGB kLightBorder = 0xFFDCE6F3;
constexpr ARGB kDarkBorder = 0xFF2E4259;
constexpr ARGB kLightAccent = 0xFF2367D9;
constexpr ARGB kDarkAccent = 0xFFA0C7FF;
constexpr ARGB kLightAccentInk = 0xFF1655B8;
constexpr ARGB kDarkAccentInk = 0xFFB8D6FF;
constexpr ARGB kLightAccentWash = 0xFFE4EFFF;
constexpr ARGB kDarkAccentWash = 0xFF203A59;
constexpr ARGB kLightCyan = 0xFF15A3BE;
constexpr ARGB kDarkCyan = 0xFF6BDEEC;
constexpr ARGB kLightText = 0xFF20242D;
constexpr ARGB kDarkText = 0xFFEDF0F7;
constexpr ARGB kLightMuted = 0xFF53667D;
constexpr ARGB kDarkMuted = 0xFFA8BFD8;
constexpr ARGB kLightCaptionHover = 0xFFEEF1F6;
constexpr ARGB kDarkCaptionHover = 0xFF292F3B;
constexpr ARGB kLightCaptionPressed = 0xFFDCE3EE;
constexpr ARGB kDarkCaptionPressed = 0xFF39404D;
constexpr ARGB kLightPrimaryText = 0xFFFFFFFF;
constexpr ARGB kDarkPrimaryText = 0xFF102A49;
constexpr ARGB kLightError = 0xFFB42318;
constexpr ARGB kDarkError = 0xFFFCA5A5;
constexpr ARGB kLightErrorWash = 0xFFFFF1F0;
constexpr ARGB kDarkErrorWash = 0xFF3A2022;
constexpr ARGB kLightSuccessInk = 0xFF1E7A44;
constexpr ARGB kDarkSuccessInk = 0xFF8CDDA6;

// Private faces loaded from installer/fonts; native-fonts.json owns the exact names and hashes.
constexpr WCHAR kFontLight[] = L"Noto Sans SC Light";
constexpr WCHAR kFontRegular[] = L"Noto Sans SC";
constexpr WCHAR kFontMedium[] = L"Noto Sans SC Medium";

// Logical layout shared by C++ painting and the NSIS MoveWindow pass.
struct InstallerLayout {
    REAL width;
    REAL height;
    bool desktop;
    REAL cardX;
    REAL cardY;
    REAL cardW;
    REAL cardH;
    REAL cardRadius;
    REAL railX;
    REAL railY;
    REAL railW;
    REAL railH;
    REAL contentX;
    REAL contentY;
    REAL contentW;
    REAL pageTitleX;
    REAL pageTitleY;
    REAL pageTitleW;
    REAL pageTitleH;
    REAL pageSubtitleY;
    REAL stepX;
    REAL stepY;
    REAL stepGap;
    REAL stepSize;
    REAL stepLabelX;
    REAL stepLabelY;
    REAL stepLabelW;
    REAL stepLastW;
    REAL kickerY;
    REAL headingY;
    REAL descY;
    REAL markX;
    REAL markY;
    REAL markSize;
    REAL labelX;
    REAL labelY;
    REAL labelW;
    REAL trackY;
    REAL trackH;
    REAL logY1;
    REAL logY2;
    REAL footnoteX;
    REAL footnoteY;
    REAL footnoteW;
    REAL footnoteH;
    REAL failureX;
    REAL failureY;
    REAL failureHeadingX;
    REAL failureHeadingY;
    REAL failureDescY;
};

static InstallerLayout ComputeInstallerLayout(REAL width, REAL height) {
    InstallerLayout layout{};
    layout.width = std::max(320.0f, width);
    layout.height = std::max(480.0f, height);
    layout.desktop = layout.width > 640.0f;
    layout.cardRadius = 20.0f;
    if (layout.desktop) {
        layout.cardW = std::min(1094.0f, layout.width - 76.0f);
        layout.cardX = (layout.width - layout.cardW) / 2.0f;
        layout.cardY = 203.0f;
        layout.cardH = 547.0f;
        layout.railX = layout.cardX + 1.0f;
        layout.railY = layout.cardY + 1.0f;
        layout.railW = 250.0f;
        layout.railH = layout.cardH - 2.0f;
        layout.contentX = layout.cardX + 251.0f;
        layout.contentY = layout.cardY + 1.0f;
        layout.contentW = layout.cardW - 252.0f;
        layout.pageTitleX = layout.cardX;
        layout.pageTitleY = 108.0f;
        layout.pageTitleW = layout.cardW;
        layout.pageTitleH = 39.0f;
        layout.pageSubtitleY = 156.0f;
        layout.stepX = layout.cardX + 27.0f;
        layout.stepY = 311.0f;
        layout.stepGap = 67.09f;
        layout.stepSize = 31.0f;
        layout.stepLabelX = layout.cardX + 70.0f;
        layout.stepLabelY = 311.0f;
        layout.stepLabelW = 197.0f;
        layout.stepLastW = 197.0f;
        layout.kickerY = 239.0f;
        layout.headingY = 265.0f;
        layout.descY = 316.0f;
        layout.markSize = 94.0f;
        layout.markX = layout.contentX + layout.contentW / 2.0f - layout.markSize / 2.0f;
        layout.markY = 358.0f;
        layout.labelX = layout.contentX + 38.0f;
        layout.labelY = 496.0f;
        layout.labelW = layout.contentW - 76.0f;
        layout.trackY = 546.0f;
        layout.trackH = 7.0f;
        layout.logY1 = 575.0f;
        layout.logY2 = 603.0f;
        layout.footnoteX = layout.cardX + 222.0f;
        layout.footnoteY = 768.0f;
        layout.footnoteW = 650.0f;
        layout.footnoteH = 19.0f;
        layout.failureX = layout.contentX + 38.0f;
        layout.failureY = 300.0f;
        layout.failureHeadingX = layout.failureX + 72.0f;
        layout.failureHeadingY = 306.0f;
        layout.failureDescY = 344.0f;
    } else {
        layout.cardX = 16.0f;
        layout.cardW = layout.width - 32.0f;
        layout.cardY = 216.0f;
        layout.cardH = 577.0f;
        layout.railX = layout.cardX;
        layout.railY = layout.cardY;
        layout.railW = 0.0f;
        layout.railH = 0.0f;
        layout.contentX = layout.cardX + 1.0f;
        layout.contentY = 276.0f;
        layout.contentW = layout.cardW - 2.0f;
        layout.pageTitleX = 16.0f;
        layout.pageTitleY = 86.0f;
        layout.pageTitleW = layout.width - 32.0f;
        layout.pageTitleH = 35.0f;
        layout.pageSubtitleY = 130.0f;
        layout.stepX = layout.cardX + 16.0f;
        layout.stepY = 234.0f;
        layout.stepGap = (layout.cardW - 82.0f) / 3.0f;
        layout.stepSize = 24.0f;
        layout.stepLabelX = layout.stepX + 30.0f;
        layout.stepLabelY = 239.0f;
        layout.stepLabelW = 84.0f;
        layout.stepLastW = std::max(24.0f, layout.cardX + layout.cardW - (layout.stepLabelX + 3.0f * layout.stepGap));
        layout.kickerY = 300.0f;
        layout.headingY = 326.0f;
        layout.descY = 375.0f;
        layout.markSize = 94.0f;
        layout.markX = (layout.width - layout.markSize) / 2.0f;
        layout.markY = 417.0f;
        layout.labelX = layout.cardX + 21.0f;
        layout.labelY = 555.0f;
        layout.labelW = layout.cardW - 42.0f;
        layout.trackY = 606.0f;
        layout.trackH = 7.0f;
        layout.logY1 = 635.0f;
        layout.logY2 = 663.0f;
        layout.footnoteX = 16.0f;
        layout.footnoteY = 808.0f;
        layout.footnoteW = layout.width - 32.0f;
        layout.footnoteH = 34.0f;
        layout.failureX = layout.cardX + 21.0f;
        layout.failureY = 300.0f;
        layout.failureHeadingX = layout.failureX + 72.0f;
        layout.failureHeadingY = 306.0f;
        layout.failureDescY = 344.0f;
    }
    return layout;
}

// Read-only C ABI for the NSIS MoveWindow pass. Inputs are parent client pixels.
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

extern "C" __declspec(dllexport) BOOL __cdecl InstallerQueryLayout(UINT width, UINT height, UINT dpi, InstallerLayoutMetrics* out) {
    if (!out || width == 0 || height == 0 || dpi < 72 || dpi > 768) return FALSE;
    const REAL logicalWidth = static_cast<REAL>(width) * 96.0f / static_cast<REAL>(dpi);
    const REAL logicalHeight = static_cast<REAL>(height) * 96.0f / static_cast<REAL>(dpi);
    const InstallerLayout layout = ComputeInstallerLayout(logicalWidth, logicalHeight);
    out->structSize = static_cast<UINT>(sizeof(InstallerLayoutMetrics));
    out->version = 1;
    out->desktop = layout.desktop ? 1u : 0u;
    const auto px = [](REAL value) { return static_cast<LONG>(value + 0.5f); };
    out->width = px(layout.width);
    out->height = px(layout.height);
    out->cardX = px(layout.cardX);
    out->cardY = px(layout.cardY);
    out->cardW = px(layout.cardW);
    out->cardH = px(layout.cardH);
    out->cardRadius = px(layout.cardRadius);
    out->railX = px(layout.railX);
    out->railY = px(layout.railY);
    out->railW = px(layout.railW);
    out->railH = px(layout.railH);
    out->contentX = px(layout.contentX);
    out->contentY = px(layout.contentY);
    out->contentW = px(layout.contentW);
    out->pageTitleX = px(layout.pageTitleX);
    out->pageTitleY = px(layout.pageTitleY);
    out->pageTitleW = px(layout.pageTitleW);
    out->pageTitleH = px(layout.pageTitleH);
    out->pageSubtitleY = px(layout.pageSubtitleY);
    out->stepX = px(layout.stepX);
    out->stepY = px(layout.stepY);
    out->stepGap = px(layout.stepGap);
    out->stepSize = px(layout.stepSize);
    out->stepLabelX = px(layout.stepLabelX);
    out->stepLabelY = px(layout.stepLabelY);
    out->stepLabelW = px(layout.stepLabelW);
    out->stepLastW = px(layout.stepLastW);
    out->kickerY = px(layout.kickerY);
    out->headingY = px(layout.headingY);
    out->descY = px(layout.descY);
    out->markX = px(layout.markX);
    out->markY = px(layout.markY);
    out->markSize = px(layout.markSize);
    out->labelX = px(layout.labelX);
    out->labelY = px(layout.labelY);
    out->labelW = px(layout.labelW);
    out->trackY = px(layout.trackY);
    out->trackH = px(layout.trackH);
    out->logY1 = px(layout.logY1);
    out->logY2 = px(layout.logY2);
    out->footnoteX = px(layout.footnoteX);
    out->footnoteY = px(layout.footnoteY);
    out->footnoteW = px(layout.footnoteW);
    out->footnoteH = px(layout.footnoteH);
    out->failureX = px(layout.failureX);
    out->failureY = px(layout.failureY);
    out->failureHeadingX = px(layout.failureHeadingX);
    out->failureHeadingY = px(layout.failureHeadingY);
    out->failureDescY = px(layout.failureDescY);
    return TRUE;
}

// GDI+ private collection; AddFontResourceEx(FR_PRIVATE) alone is not visible to FontFamily.
struct FontCatalog {
    ULONG_PTR token = 0;
    PrivateFontCollection* collection = nullptr;
    FontFamily* light = nullptr;
    FontFamily* regular = nullptr;
    FontFamily* medium = nullptr;

    ~FontCatalog() {
        delete light;
        delete regular;
        delete medium;
        delete collection;
        if (token) GdiplusShutdown(token);
    }
};

static FontCatalog* g_fontCatalog = nullptr;

static bool FontReady(Font& font) {
    return font.GetLastStatus() == Ok;
}

static FontFamily* FindPrivateFamily(FontCatalog& catalog, const WCHAR* expected) {
    if (!catalog.collection) return nullptr;
    INT count = catalog.collection->GetFamilyCount();
    if (count <= 0) return nullptr;
    std::vector<FontFamily> families(static_cast<std::size_t>(count));
    INT found = 0;
    if (catalog.collection->GetFamilies(count, families.data(), &found) != Ok || found <= 0) return nullptr;
    for (INT index = 0; index < found; ++index) {
        WCHAR name[LF_FACESIZE] = {};
        if (families[static_cast<std::size_t>(index)].GetFamilyName(name) != Ok) continue;
        if (_wcsicmp(name, expected) == 0) {
            // MSVC GDI+ uses Clone(); do not depend on an undocumented copy constructor.
            FontFamily* family = families[static_cast<std::size_t>(index)].Clone();
            if (!family || family->GetLastStatus() != Ok) {
                delete family;
                return nullptr;
            }
            return family;
        }
    }
    return nullptr;
}

struct Palette {
    ARGB page;
    ARGB card;
    ARGB field;
    ARGB fieldBorder;
    ARGB border;
    ARGB accent;
    ARGB accentInk;
    ARGB accentWash;
    ARGB cyan;
    ARGB text;
    ARGB muted;
    ARGB captionHover;
    ARGB captionPressed;
    ARGB primaryText;
    ARGB error;
    ARGB errorWash;
    ARGB successInk;
};

static Palette PaletteFor(bool dark) {
    return dark
        ? Palette{kDarkBg, kDarkCard, kDarkField, kDarkFieldBorder, kDarkBorder, kDarkAccent, kDarkAccentInk,
                  kDarkAccentWash, kDarkCyan, kDarkText, kDarkMuted, kDarkCaptionHover, kDarkCaptionPressed,
                  kDarkPrimaryText, kDarkError, kDarkErrorWash, kDarkSuccessInk}
        : Palette{kLightBg, kLightCard, kLightField, kLightFieldBorder, kLightBorder, kLightAccent, kLightAccentInk,
                  kLightAccentWash, kLightCyan, kLightText, kLightMuted, kLightCaptionHover, kLightCaptionPressed,
                  kLightPrimaryText, kLightError, kLightErrorWash, kLightSuccessInk};
}

static void AddRoundedRect(GraphicsPath& path, REAL x, REAL y, REAL width, REAL height, REAL radius) {
    if (radius <= 0) {
        path.AddRectangle(RectF(x, y, width, height));
        return;
    }
    radius = std::min(radius, std::min(width, height) / 2);
    const REAL diameter = radius * 2;
    path.AddArc(x, y, diameter, diameter, 180.0f, 90.0f);
    path.AddArc(x + width - diameter, y, diameter, diameter, 270.0f, 90.0f);
    path.AddArc(x + width - diameter, y + height - diameter, diameter, diameter, 0.0f, 90.0f);
    path.AddArc(x, y + height - diameter, diameter, diameter, 90.0f, 90.0f);
    path.CloseFigure();
}

static void FillRounded(Graphics& graphics, Brush& brush, REAL x, REAL y, REAL width, REAL height, REAL radius) {
    GraphicsPath path;
    AddRoundedRect(path, x, y, width, height, radius);
    graphics.FillPath(&brush, &path);
}

static void StrokeRounded(Graphics& graphics, Pen& pen, REAL x, REAL y, REAL width, REAL height, REAL radius) {
    GraphicsPath path;
    AddRoundedRect(path, x, y, width, height, radius);
    graphics.DrawPath(&pen, &path);
}

static void PaintGlow(Graphics& graphics, REAL centerX, REAL centerY, REAL radiusX, REAL radiusY, const Color& color) {
    GraphicsPath path;
    path.AddEllipse(centerX - radiusX, centerY - radiusY, radiusX * 2, radiusY * 2);
    PathGradientBrush brush(&path);
    brush.SetCenterColor(color);
    const Color surround(static_cast<ARGB>((color.GetR() << 16) | (color.GetG() << 8) | color.GetB()));
    INT count = 1;
    brush.SetSurroundColors(&surround, &count);
    graphics.FillPath(&brush, &path);
}

struct SceneRgb {
    BYTE r;
    BYTE g;
    BYTE b;
};

static BYTE SceneByte(REAL value) {
    return static_cast<BYTE>(std::max(0.0f, std::min(255.0f, value)));
}

static SceneRgb SceneRgbValue(BYTE r, BYTE g, BYTE b) {
    const BYTE gray = SceneByte(r * 0.299f + g * 0.587f + b * 0.114f);
    return {SceneByte(gray + (r - gray) * 0.86f),
        SceneByte(gray + (g - gray) * 0.86f),
        SceneByte(gray + (b - gray) * 0.86f)};
}

static BYTE SceneAlpha(REAL opacity, REAL stop) {
    return SceneByte(255.0f * opacity * stop);
}

static Bitmap* CreateLayer(const InstallerLayout& layout, REAL padding = 0.0f) {
    const INT inset = static_cast<INT>(std::ceil(padding));
    const INT width = static_cast<INT>(std::ceil(layout.width)) + inset * 2;
    const INT height = static_cast<INT>(std::ceil(layout.height)) + inset * 2;
    if (width <= 0 || height <= 0) return nullptr;
    auto* layer = new Bitmap(width, height, PixelFormat32bppARGB);
    if (!layer || layer->GetLastStatus() != Ok) {
        delete layer;
        return nullptr;
    }
    return layer;
}

static bool BlurLayer(Bitmap* layer, REAL radius) {
    if (!layer || radius <= 0.0f) return false;
    Blur blur;
    BlurParams params = {};
    params.radius = radius;
    params.expandEdge = TRUE;
    if (blur.SetParameters(&params) != Ok) return false;
    return layer->ApplyEffect(&blur, nullptr) == Ok;
}

static void DrawLayerCropped(Graphics& target, Bitmap* layer, const InstallerLayout& layout, REAL padding) {
    (void)layout;
    if (!layer) return;
    target.DrawImage(layer, RectF(-padding, -padding,
        static_cast<REAL>(layer->GetWidth()), static_cast<REAL>(layer->GetHeight())));
}

// Colors are ordered boundary(0) -> center(1), matching GDI+ PathGradientBrush.
static void PaintEllipseGradient(Graphics& graphics, REAL centerX, REAL centerY, REAL radiusX, REAL radiusY,
                                 REAL angle, const Color* colors, const REAL* positions, INT count) {
    GraphicsPath path;
    path.AddEllipse(-radiusX, -radiusY, radiusX * 2.0f, radiusY * 2.0f);
    PathGradientBrush brush(&path);
    Color surround(0);
    INT surroundCount = 1;
    brush.SetSurroundColors(&surround, &surroundCount);
    brush.SetCenterColor(colors[count - 1]);
    brush.SetInterpolationColors(colors, positions, count);
    const GraphicsState state = graphics.Save();
    graphics.TranslateTransform(centerX, centerY);
    graphics.RotateTransform(angle);
    graphics.FillPath(&brush, &path);
    graphics.Restore(state);
}

static void PaintCloudLayer(Graphics& target, const Palette& palette, const InstallerLayout& layout, REAL ambient) {
    const bool dark = palette.page == kDarkBg;
    const SceneRgb ice = SceneRgbValue(static_cast<BYTE>(dark ? 151 : 192), static_cast<BYTE>(dark ? 224 : 240), 255);
    const SceneRgb cyan = SceneRgbValue(static_cast<BYTE>(dark ? 26 : 37), static_cast<BYTE>(dark ? 177 : 183),
        static_cast<BYTE>(dark ? 229 : 230));
    const SceneRgb blue = SceneRgbValue(static_cast<BYTE>(dark ? 22 : 31), static_cast<BYTE>(dark ? 104 : 118),
        static_cast<BYTE>(dark ? 247 : 246));
    const REAL inset = layout.desktop ? 0.06f : 0.03f;
    const REAL fieldX = -inset * layout.width;
    const REAL fieldY = -inset * layout.height;
    const REAL fieldW = (1.0f + inset * 2.0f) * layout.width;
    const REAL fieldH = (1.0f + inset * 2.0f) * layout.height;
    const REAL cloudX = fieldX - 0.09f * fieldW;
    const REAL cloudY = fieldY - 0.09f * fieldH;
    const REAL cloudW = 1.18f * fieldW;
    const REAL cloudH = 1.18f * fieldH;
    auto cloud = [&](Graphics& destination, REAL px, REAL py, REAL rx, REAL ry,
                     const SceneRgb& rgb, REAL alpha) {
        const Color colors[3] = {Color(0), Color(0), Color(SceneAlpha(ambient * 0.7f, alpha), rgb.r, rgb.g, rgb.b)};
        const REAL positions[3] = {0.0f, 0.25f, 1.0f};
        PaintEllipseGradient(destination, px, py, rx, ry, 0.0f, colors, positions, 3);
    };
    const REAL blur = layout.desktop ? 28.0f : 19.0f;
    const REAL padding = std::ceil(blur * 1.5f + 4.0f);
    Bitmap* layer = CreateLayer(layout, padding);
    if (!layer) return;
    {
        Graphics graphics(layer);
        graphics.SetSmoothingMode(SmoothingModeAntiAlias);
        graphics.Clear(Color(0));
        graphics.TranslateTransform(padding, padding);
        cloud(graphics, cloudX + cloudW * 0.86f, cloudY + cloudH * 0.18f,
            cloudW * 0.38f, cloudH * 0.45f, cyan, 0.52f);
        cloud(graphics, cloudX + cloudW * 0.21f, cloudY + cloudH * 0.87f,
            cloudW * 0.42f, cloudH * 0.39f, blue, 0.55f);
        cloud(graphics, cloudX + cloudW * 0.66f, cloudY + cloudH * 0.68f,
            cloudW * 0.30f, cloudH * 0.26f, ice, 0.38f);
    }
    BlurLayer(layer, blur);
    DrawLayerCropped(target, layer, layout, padding);
    delete layer;
}

static void PaintRibbonLayer(Graphics& target, const Palette& palette, const InstallerLayout& layout,
                             bool distant, REAL ambient) {
    const bool dark = palette.page == kDarkBg;
    const SceneRgb ice = SceneRgbValue(static_cast<BYTE>(dark ? 151 : 192), static_cast<BYTE>(dark ? 224 : 240), 255);
    const SceneRgb cyan = SceneRgbValue(static_cast<BYTE>(dark ? 26 : 37), static_cast<BYTE>(dark ? 177 : 183),
        static_cast<BYTE>(dark ? 229 : 230));
    const SceneRgb blue = SceneRgbValue(static_cast<BYTE>(dark ? 22 : 31), static_cast<BYTE>(dark ? 104 : 118),
        static_cast<BYTE>(dark ? 247 : 246));
    const REAL opacity = (distant ? 0.24f : 0.65f) * ambient;
    const REAL stopAlpha[9] = {0.0f, 0.0f, 0.10f, 0.76f, 0.62f, 0.56f, 0.16f, 0.0f, 0.0f};
    const REAL positions[9] = {0.0f, 0.33f, 0.43f, 0.50f, 0.55f, 0.59f, 0.63f, 0.67f, 1.0f};
    Color baseColors[9];
    for (int index = 0; index < 9; ++index) {
        const int css = 8 - index;
        baseColors[index] = Color(0);
        if (stopAlpha[css] > 0.0f) {
            const SceneRgb& rgb = (css == 2 || css == 3) ? ice : (css == 4 ? cyan : blue);
            baseColors[index] = Color(SceneAlpha(opacity, stopAlpha[css]), rgb.r, rgb.g, rgb.b);
        }
    }
    const REAL afterPositions[6] = {0.0f, 0.53f, 0.57f, 0.595f, 0.615f, 1.0f};
    const REAL afterAlpha[6] = {0.0f, 0.0f, 0.12f, 0.83f, 0.0f, 0.0f};
    Color afterColors[6];
    for (int index = 0; index < 6; ++index) {
        afterColors[index] = afterAlpha[index] > 0.0f
            ? Color(SceneAlpha(opacity * 0.58f, afterAlpha[index]), ice.r, ice.g, ice.b)
            : Color(0);
    }
    const REAL ribbonBlur = layout.desktop ? (distant ? 31.0f : 24.0f) : (distant ? 22.0f : 18.0f);
    const REAL ribbonPadding = std::ceil(ribbonBlur * 1.5f + 4.0f);
    Bitmap* layer = CreateLayer(layout, ribbonPadding);
    if (!layer) return;
    REAL blurRadius = 0.0f;
    {
        Graphics graphics(layer);
        graphics.SetSmoothingMode(SmoothingModeAntiAlias);
        graphics.Clear(Color(0));
        graphics.TranslateTransform(ribbonPadding, ribbonPadding);
        REAL centerX = 0.0f;
        REAL centerY = 0.0f;
        REAL radiusX = 0.0f;
        REAL radiusY = 0.0f;
        REAL angle = 0.0f;
        if (layout.desktop) {
            if (distant) {
                centerX = layout.width * 0.892f; centerY = layout.height * -0.088f;
                radiusX = layout.width * 0.8712f; radiusY = layout.height * 0.6126f;
                angle = -32.0f; blurRadius = 31.0f;
            } else {
                centerX = layout.width * 0.5f; centerY = layout.height * 0.8024f;
                radiusX = layout.width * 0.9979f; radiusY = layout.height * 0.6691f;
                angle = -26.0f; blurRadius = 24.0f;
            }
        } else if (distant) {
            centerX = layout.width * 1.2102f; centerY = layout.height * -0.0035f;
            radiusX = layout.width * 1.574f; radiusY = layout.height * 0.5115f;
            angle = -32.0f; blurRadius = 22.0f;
        } else {
            centerX = layout.width * 0.4152f; centerY = layout.height * 0.7438f;
            radiusX = layout.width * 1.8738f; radiusY = layout.height * 0.5277f;
            angle = -26.0f; blurRadius = 18.0f;
        }
        PaintEllipseGradient(graphics, centerX, centerY, radiusX, radiusY, angle, baseColors, positions, 9);
        PaintEllipseGradient(graphics, centerX, centerY, radiusX, radiusY, angle, afterColors, afterPositions, 6);
    }
    BlurLayer(layer, blurRadius);
    DrawLayerCropped(target, layer, layout, ribbonPadding);
    delete layer;
}

static void PaintVeil(Graphics& target, const Palette& palette, const InstallerLayout& layout, REAL ambient) {
    const bool dark = palette.page == kDarkBg;
    const SceneRgb veil = SceneRgbValue(static_cast<BYTE>(dark ? 5 : 250),
        static_cast<BYTE>(dark ? 17 : 253), static_cast<BYTE>(dark ? 35 : 255));
    REAL alpha = 0.44f;
    REAL transparent = 0.15f;
    REAL centerX = 0.0f;
    REAL centerY = 0.0f;
    REAL radiusX = 0.0f;
    REAL radiusY = 0.0f;
    const REAL inset = layout.desktop ? 0.06f : 0.03f;
    const REAL fieldX = -inset * layout.width;
    const REAL fieldY = -inset * layout.height;
    const REAL fieldW = (1.0f + inset * 2.0f) * layout.width;
    const REAL fieldH = (1.0f + inset * 2.0f) * layout.height;
    if (layout.desktop) {
        centerX = fieldX + fieldW * 0.58f;
        if (dark) {
            alpha = 0.52f;
            centerY = fieldY + fieldH * 0.32f;
            radiusX = fieldW * 0.45f;
            radiusY = fieldH * 0.35f;
            transparent = 0.15f;
        } else {
            centerY = fieldY + fieldH * 0.33f;
            radiusX = fieldW * 0.43f;
            radiusY = fieldH * 0.39f;
            transparent = 0.15f;
        }
    } else {
        centerX = fieldX + fieldW * 0.50f;
        radiusX = fieldW * 0.80f;
        if (dark) {
            alpha = 0.45f;
            centerY = fieldY + fieldH * 0.27f;
            radiusY = fieldH * 0.36f;
            transparent = 0.14f;
        } else {
            centerY = fieldY + fieldH * 0.30f;
            radiusY = fieldH * 0.35f;
            transparent = 0.18f;
        }
    }
    const Color colors[3] = {Color(0), Color(0), Color(SceneAlpha(ambient, alpha), veil.r, veil.g, veil.b)};
    const REAL positions[3] = {0.0f, 1.0f - transparent, 1.0f};
    PaintEllipseGradient(target, centerX, centerY, radiusX, radiusY, 0.0f, colors, positions, 3);
}

static void DrawTextBlock(Graphics& graphics, const std::wstring& text, Font& font, Brush& brush,
                          REAL x, REAL y, REAL width, REAL height, bool wrap = false,
                          StringAlignment alignment = StringAlignmentNear) {
    if (text.empty()) return;
    if (!wrap) {
        // SDK-supported clone of GenericTypographic; preserve its flags when adding NoWrap.
        StringFormat format(StringFormat::GenericTypographic());
        format.SetAlignment(StringAlignmentNear);
        format.SetLineAlignment(StringAlignmentNear);
        format.SetTrimming(StringTrimmingEllipsisCharacter);
        format.SetFormatFlags(format.GetFormatFlags() | StringFormatFlagsNoWrap);
        RectF bounds;
        graphics.MeasureString(text.c_str(), -1, &font, PointF(0, 0), &format, &bounds);
        REAL drawX = x;
        if (alignment == StringAlignmentFar) drawX = x + width - bounds.Width;
        else if (alignment == StringAlignmentCenter) drawX = x + (width - bounds.Width) / 2.0f;
        const REAL fontHeight = font.GetHeight(&graphics);
        const REAL drawY = y + (height > fontHeight ? (height - fontHeight) / 2.0f : 0.0f);
        graphics.DrawString(text.c_str(), -1, &font, PointF(drawX, drawY), &format, &brush);
        return;
    }
    StringFormat format(StringFormat::GenericTypographic());
    format.SetAlignment(alignment);
    format.SetLineAlignment(StringAlignmentNear);
    format.SetTrimming(StringTrimmingEllipsisCharacter);
    graphics.DrawString(text.c_str(), -1, &font, RectF(x, y, width, height), &format, &brush);
}

static void PaintCheck(Graphics& graphics, const Palette& palette, REAL x, REAL y) {
    Pen pen(Color(palette.accentInk), 1.4f);
    const PointF points[] = {{x + 1, y + 6}, {x + 5, y + 10}, {x + 13, y + 1}};
    graphics.DrawLines(&pen, points, 3);
}

static void PaintShield(Graphics& graphics, const Palette& palette, REAL x, REAL y) {
    GraphicsPath shield;
    const PointF points[] = {
        {x + 7.0f, y + 1.0f}, {x + 13.0f, y + 3.0f}, {x + 12.0f, y + 9.0f},
        {x + 7.0f, y + 13.0f}, {x + 2.0f, y + 9.0f}, {x + 1.0f, y + 3.0f},
    };
    shield.AddLines(points, 6);
    shield.CloseFigure();
    Pen pen(Color(palette.accentInk), 1.4f);
    graphics.DrawPath(&pen, &shield);
}

static void PaintStepStrip(Graphics& graphics, const Palette& palette, const InstallerLayout& layout, int current, bool failed) {
    FontFamily& family = *g_fontCatalog->regular;
    Font numberFont(&family, layout.desktop ? 12.0f : 11.0f, FontStyleRegular, UnitPixel);
    if (!FontReady(numberFont)) return;
    StringFormat centered;
    centered.SetAlignment(StringAlignmentCenter);
    centered.SetLineAlignment(StringAlignmentCenter);
    for (int index = 0; index < 4; ++index) {
        const REAL x = layout.desktop ? layout.stepX : layout.stepX + static_cast<REAL>(index) * layout.stepGap;
        const REAL y = layout.desktop ? layout.stepY + static_cast<REAL>(index) * layout.stepGap : layout.stepY;
        const REAL size = layout.stepSize;
        const bool isCurrent = index == current;
        const bool done = index < current;
        GraphicsPath path;
        AddRoundedRect(path, x, y, size, size, layout.desktop ? 10.0f : 8.0f);
        if (isCurrent) {
            SolidBrush fill(Color(failed ? palette.errorWash : palette.accent));
            graphics.FillPath(&fill, &path);
            if (failed) {
                Pen border(Color(palette.error), 1.0f);
                graphics.DrawPath(&border, &path);
            }
            SolidBrush ink(Color(failed ? palette.error : palette.primaryText));
            if (failed) {
                FontFamily& mediumFamily = *g_fontCatalog->medium;
                Font mark(&mediumFamily, 20.0f, FontStyleRegular, UnitPixel);
                graphics.DrawString(L"!", -1, &mark, RectF(x, y - 2, size, size), &centered, &ink);
            } else {
                WCHAR text[2] = {static_cast<WCHAR>(L'1' + index), 0};
                graphics.DrawString(text, -1, &numberFont, RectF(x, y, size, size), &centered, &ink);
            }
        } else if (done) {
            SolidBrush fill(Color(palette.accentWash));
            graphics.FillPath(&fill, &path);
            Pen doneBorder(Color(palette.border), 1.0f);
            graphics.DrawPath(&doneBorder, &path);
            PaintCheck(graphics, palette, x + (size - 14.0f) / 2.0f, y + (size - 14.0f) / 2.0f);
        } else {
            SolidBrush fill(Color(palette.field));
            graphics.FillPath(&fill, &path);
            Pen border(Color(palette.fieldBorder), 1.0f);
            graphics.DrawPath(&border, &path);
            SolidBrush ink(Color(palette.muted));
            WCHAR text[2] = {static_cast<WCHAR>(L'1' + index), 0};
            graphics.DrawString(text, -1, &numberFont, RectF(x, y, size, size), &centered, &ink);
        }
    }
    if (layout.desktop) {
        Pen connector(Color(palette.border), 1.0f);
        for (int index = 0; index < 3; ++index) {
            const REAL x = layout.stepX + layout.stepSize / 2.0f;
            const REAL top = layout.stepY + static_cast<REAL>(index) * layout.stepGap + layout.stepSize;
            graphics.DrawLine(&connector, x, top, x, top + layout.stepGap - layout.stepSize - 10.0f);
        }
    }
}

static void PaintSuccessTile(Graphics& graphics, const Palette& palette, const InstallerLayout& layout) {
    const REAL x = layout.desktop ? layout.contentX + layout.contentW / 2.0f - 28.0f : (layout.width - 56.0f) / 2.0f;
    const REAL y = layout.desktop ? 300.0f : 300.0f;
    const REAL size = 56;
    SolidBrush fill(Color(palette.accentWash));
    FillRounded(graphics, fill, x, y, size, size, 18);
    Pen border(Color(palette.accentWash), 1.0f);
    StrokeRounded(graphics, border, x, y, size, size, 18);
    Pen check(Color(palette.successInk), 3.0f);
    const PointF points[] = {{x + 14, y + 29}, {x + 24, y + 39}, {x + 42, y + 18}};
    graphics.DrawLines(&check, points, 3);
}

static void PaintFailureTile(Graphics& graphics, const Palette& palette, const InstallerLayout& layout) {
    const REAL x = layout.failureX;
    const REAL y = layout.failureY;
    const REAL size = 56;
    SolidBrush fill(Color(palette.errorWash));
    FillRounded(graphics, fill, x, y, size, size, 18);
    Pen border(Color(palette.error), 1.0f);
    StrokeRounded(graphics, border, x, y, size, size, 18);
    FontFamily& mediumFamily = *g_fontCatalog->medium;
    Font mark(&mediumFamily, 24.0f, FontStyleRegular, UnitPixel);
    if (!FontReady(mark)) return;
    StringFormat centered;
    centered.SetAlignment(StringAlignmentCenter);
    centered.SetLineAlignment(StringAlignmentCenter);
    SolidBrush ink(Color(palette.error));
    graphics.DrawString(L"!", -1, &mark, RectF(x, y - 2, size, size), &centered, &ink);
}

static void PaintBackdrop(Graphics& graphics, const Palette& palette, const InstallerLayout& layout, int phase, bool failed) {
    graphics.Clear(Color(palette.page));
    const bool dark = palette.page == kDarkBg;
    const REAL ambient = layout.desktop
        ? (dark ? 0.686f : 0.4472f)
        : (dark ? 0.588f : 0.387f);
    Bitmap* scene = CreateLayer(layout);
    if (scene) {
        {
            Graphics background(scene);
            background.SetSmoothingMode(SmoothingModeAntiAlias);
            background.SetPixelOffsetMode(PixelOffsetModeHalf);
            background.Clear(Color(palette.page));
            PaintCloudLayer(background, palette, layout, ambient);
            PaintRibbonLayer(background, palette, layout, false, ambient);
            PaintRibbonLayer(background, palette, layout, true, ambient);
            PaintVeil(background, palette, layout, ambient);
        }
        graphics.DrawImage(scene, RectF(0, 0, layout.width, layout.height));
    }

    const REAL shadowBlur = 80.0f;
    const REAL shadowPadding = std::ceil(shadowBlur * 1.5f + 4.0f);
    Bitmap* shadow = CreateLayer(layout, shadowPadding);
    if (shadow) {
        {
            Graphics shadowGraphics(shadow);
            shadowGraphics.SetSmoothingMode(SmoothingModeAntiAlias);
            shadowGraphics.Clear(Color(0));
            shadowGraphics.TranslateTransform(shadowPadding, shadowPadding);
            SolidBrush shadowBrush(dark ? Color(0x47000000) : Color(0x1F25528E));
            FillRounded(shadowGraphics, shadowBrush, layout.cardX, layout.cardY + 28.0f,
                layout.cardW, layout.cardH, layout.cardRadius);
        }
        BlurLayer(shadow, shadowBlur);
        DrawLayerCropped(graphics, shadow, layout, shadowPadding);
        delete shadow;
    }

    GraphicsPath cardPath;
    AddRoundedRect(cardPath, layout.cardX, layout.cardY, layout.cardW, layout.cardH, layout.cardRadius);
    if (scene) {
        Bitmap* glass = CreateLayer(layout);
        if (glass) {
            {
                Graphics glassGraphics(glass);
                glassGraphics.SetSmoothingMode(SmoothingModeAntiAlias);
                glassGraphics.Clear(Color(0));
                glassGraphics.DrawImage(scene, 0, 0);
            }
            BlurLayer(glass, 28.0f);
            graphics.SetClip(&cardPath);
            graphics.DrawImage(glass, RectF(0, 0, layout.width, layout.height));
            graphics.ResetClip();
            delete glass;
        }
        delete scene;
    }

    const ARGB card = palette.card;
    const BYTE cardAlpha = static_cast<BYTE>(dark ? 0xED : 0xDE);
    SolidBrush cardFill(Color(cardAlpha, static_cast<BYTE>((card >> 16) & 0xFF),
        static_cast<BYTE>((card >> 8) & 0xFF), static_cast<BYTE>(card & 0xFF)));
    FillRounded(graphics, cardFill, layout.cardX, layout.cardY, layout.cardW, layout.cardH, layout.cardRadius);
    Pen inset(dark ? Color(0x1A, static_cast<BYTE>(181), static_cast<BYTE>(217), static_cast<BYTE>(255))
                   : Color(0xB3, static_cast<BYTE>(255), static_cast<BYTE>(255), static_cast<BYTE>(255)), 1.0f);
    graphics.SetClip(&cardPath);
    graphics.DrawLine(&inset, layout.cardX, layout.cardY + 1.0f,
        layout.cardX + layout.cardW, layout.cardY + 1.0f);
    graphics.ResetClip();
    Pen border(Color(palette.border), 1.0f);
    StrokeRounded(graphics, border, layout.cardX, layout.cardY, layout.cardW, layout.cardH, layout.cardRadius);

    if (layout.desktop) {
        GraphicsPath railClip;
        AddRoundedRect(railClip, layout.cardX, layout.cardY, layout.cardW, layout.cardH, layout.cardRadius);
        graphics.SetClip(&railClip);
        LinearGradientBrush rail(RectF(layout.railX, layout.railY, layout.railW, layout.railH),
            Color(palette.page == kDarkBg ? 0xCC203A59 : 0xCCE4EFFF),
            Color(palette.page == kDarkBg ? 0x00203A59 : 0x00E4EFFF), 160.0f);
        graphics.FillRectangle(&rail, layout.railX, layout.railY, layout.railW, layout.railH);
        graphics.ResetClip();
    }
    const int current = phase == 0 ? 1 : phase == 1 ? 3 : phase == 4 ? 0 : 2;
    PaintStepStrip(graphics, palette, layout, current, failed);
    Pen divider(Color(palette.border), 1.0f);
    if (layout.desktop) {
        graphics.DrawLine(&divider, layout.cardX + 251.0f, layout.cardY + 1.0f,
            layout.cardX + 251.0f, layout.cardY + layout.cardH - 1.0f);
    } else {
        graphics.DrawLine(&divider, layout.cardX + 1.0f, layout.contentY,
            layout.cardX + layout.cardW - 1.0f, layout.contentY);
    }
    if (phase == 1) {
        PaintSuccessTile(graphics, palette, layout);
    } else if (phase == 3) {
        PaintFailureTile(graphics, palette, layout);
    }
}

struct ProgressPage {
    InstallProgress progress{GetTickCount64()};
    bool dark;
    bool failed = false;
    bool immediateComplete = false;
    bool squareBrand = false;
    bool fontError = false;
    bool reduceMotion = false;
    REAL width = 600.0f;
    REAL height = 844.0f;
    InstallerLayout layout{};
    UINT dpi;
    ULONG_PTR gdiplus;
    Image* brand;
    Bitmap* staticBackdrop = nullptr;
    Bitmap* buffer;
    HDC bufferDc;
    HBITMAP bufferBitmap;
    HGDIOBJ previousBitmap;
    UINT pressedCommand;
    UINT hoveredCommand;
    ARGB controlHover;
    ARGB controlPressed;
    WCHAR captions[5][128];
    std::wstring labels[19];

    ~ProgressPage() {
        delete staticBackdrop;
        delete buffer;
        delete brand;
        if (previousBitmap) SelectObject(bufferDc, previousBitmap);
        if (bufferBitmap) DeleteObject(bufferBitmap);
        if (bufferDc) DeleteDC(bufferDc);
        if (gdiplus) GdiplusShutdown(gdiplus);
    }
};

// NSIS shows its page after MUI's SHOW callback; keep its controls off screen.
static LRESULT CALLBACK HiddenPageProc(HWND window, UINT message, WPARAM wparam,
                                      LPARAM lparam, UINT_PTR id, DWORD_PTR) {
    if (message == WM_WINDOWPOSCHANGING) {
        auto* position = reinterpret_cast<WINDOWPOS*>(lparam);
        position->flags = (position->flags & ~SWP_SHOWWINDOW) | SWP_HIDEWINDOW;
    }
    if (message == WM_NCDESTROY) RemoveWindowSubclass(window, HiddenPageProc, id);
    return DefSubclassProc(window, message, wparam, lparam);
}

static UINT CaptionCommand(const ProgressPage& page, LPARAM position) {
    const int x = static_cast<short>(LOWORD(position));
    const int y = static_cast<short>(HIWORD(position));
    const int captionX = MulDiv(static_cast<int>(page.width - 96.0f), page.dpi, 96);
    const int closeX = MulDiv(static_cast<int>(page.width - 52.0f), page.dpi, 96);
    const int right = MulDiv(static_cast<int>(page.width), page.dpi, 96);
    if (y < 0 || y >= MulDiv(48, page.dpi, 96) || x < captionX || x >= right) return 0;
    return x >= closeX ? SC_CLOSE : SC_MINIMIZE;
}

static void PaintCaptionButtons(Graphics& graphics, const ProgressPage& page) {
    const Palette palette = PaletteFor(page.dark);
    SolidBrush background(Color(palette.page));
    graphics.FillRectangle(&background, page.width - 96.0f, 0.0f, 96.0f, 48.0f);
    SolidBrush ink(Color(palette.muted));
    FontFamily& family = *g_fontCatalog->regular;
    Font font(&family, 14.0f, FontStyleRegular, UnitPixel);
    if (!FontReady(font)) return;
    StringFormat centered;
    centered.SetAlignment(StringAlignmentCenter);
    centered.SetLineAlignment(StringAlignmentCenter);
    for (UINT command : {SC_MINIMIZE, SC_CLOSE}) {
        const REAL x = command == SC_MINIMIZE ? page.width - 96.0f : page.width - 52.0f;
        if (page.hoveredCommand == command && (!page.pressedCommand || page.pressedCommand == command)) {
            const bool pressed = page.pressedCommand == command;
            SolidBrush fill(Color(pressed ? page.controlPressed : page.controlHover));
            FillRounded(graphics, fill, x, 8, 40, 32, 10);
        }
        graphics.DrawString(command == SC_MINIMIZE ? L"\x2212" : L"\x00d7", -1,
            &font, RectF(x, 8, 40, 32), &centered, &ink);
    }
}

static void InvalidateCaptionButtons(HWND window, const ProgressPage& page) {
    RECT bounds{MulDiv(static_cast<int>(page.width - 96.0f), page.dpi, 96), 0,
        MulDiv(static_cast<int>(page.width), page.dpi, 96), MulDiv(48, page.dpi, 96)};
    InvalidateRect(window, &bounds, FALSE);
}

// Rebuilds the static layer once per state change: normal progress or terminal failure.
static void RenderProgressStatic(ProgressPage& page) {
    Graphics graphics(page.buffer);
    graphics.ScaleTransform(page.dpi / 96.0f, page.dpi / 96.0f);
    graphics.SetSmoothingMode(SmoothingModeAntiAlias);
    graphics.SetPixelOffsetMode(PixelOffsetModeHalf);
    graphics.SetInterpolationMode(InterpolationModeHighQualityBicubic);
    graphics.SetTextRenderingHint(TextRenderingHintAntiAlias);
    const Palette palette = PaletteFor(page.dark);
    const InstallerLayout& layout = page.layout;
    PaintBackdrop(graphics, palette, layout, page.failed ? 3 : 2, page.failed);
    FontFamily& bodyFamily = *g_fontCatalog->regular;
    FontFamily& mediumFamily = *g_fontCatalog->medium;
    Font pageTitle(&bodyFamily, layout.desktop ? 29.0f : 26.0f, FontStyleRegular, UnitPixel);
    if (!FontReady(pageTitle)) { page.fontError = true; return; }
    SolidBrush pageText(Color(palette.text));
    DrawTextBlock(graphics, page.labels[12], pageTitle, pageText,
        layout.pageTitleX, layout.pageTitleY, layout.pageTitleW, layout.pageTitleH);
    Font pageSubtitle(&bodyFamily, 13.0f, FontStyleRegular, UnitPixel);
    if (!FontReady(pageSubtitle)) { page.fontError = true; return; }
    SolidBrush pageMuted(Color(palette.muted));
    DrawTextBlock(graphics, page.labels[13], pageSubtitle, pageMuted,
        layout.pageTitleX, layout.pageSubtitleY, layout.pageTitleW, 22.5f);
    if (layout.desktop && page.brand && page.squareBrand) {
        graphics.DrawImage(page.brand, RectF(layout.cardX + 27.0f, layout.cardY + 30.0f, 43.0f, 43.0f));
        const std::wstring& wordmark = page.labels[18];
        Font wordmarkFont(&mediumFamily, 22.0f, FontStyleRegular, UnitPixel);
        if (!FontReady(wordmarkFont)) { page.fontError = true; return; }
        DrawTextBlock(graphics, wordmark, wordmarkFont, pageText,
            layout.cardX + 79.0f, layout.cardY + 34.6f, 150.0f, 32.0f);
    }
    Font step(&mediumFamily, layout.desktop ? 13.0f : 10.0f, FontStyleRegular, UnitPixel);
    if (!FontReady(step)) { page.fontError = true; return; }
    for (int index = 0; index < 4; ++index) {
        const REAL stepX = layout.stepLabelX + (layout.desktop ? 0.0f : static_cast<REAL>(index) * layout.stepGap);
        const REAL stepY = layout.stepLabelY + (layout.desktop ? static_cast<REAL>(index) * layout.stepGap : 0.0f);
        const REAL stepWidth = index == 3 ? layout.stepLastW : layout.stepLabelW;
        SolidBrush stepInk(Color(index == 2 ? palette.text : palette.muted));
        DrawTextBlock(graphics, page.labels[3 + index], step, stepInk, stepX, stepY, stepWidth, layout.desktop ? 22.1f : 17.0f);
        if (layout.desktop) {
            Font stepSmall(&bodyFamily, 10.0f, FontStyleRegular, UnitPixel);
            if (!FontReady(stepSmall)) { page.fontError = true; return; }
            DrawTextBlock(graphics, page.labels[14 + index], stepSmall, pageMuted,
                stepX, stepY + 26.0f, stepWidth, 17.0f, true);
        }
    }
    if (layout.desktop) {
        Font railNote(&bodyFamily, 10.0f, FontStyleRegular, UnitPixel);
        if (!FontReady(railNote)) { page.fontError = true; return; }
        DrawTextBlock(graphics, page.labels[9], railNote, pageMuted,
            layout.cardX + 27.0f, layout.cardY + layout.cardH - 64.0f, 197.0f, 52.0f, true);
    }
    if (page.failed) {
        Font heading(&mediumFamily, 23.0f, FontStyleRegular, UnitPixel);
        if (!FontReady(heading)) { page.fontError = true; return; }
        SolidBrush text(Color(palette.text));
        DrawTextBlock(graphics, page.labels[10], heading, text,
            layout.failureHeadingX, layout.failureHeadingY, layout.labelW, 34);
        Font body(&bodyFamily, 13.0f, FontStyleRegular, UnitPixel);
        SolidBrush muted(Color(palette.muted));
        DrawTextBlock(graphics, page.labels[11], body, muted,
            layout.failureHeadingX, layout.failureDescY, layout.labelW, 96, true);
        return;
    }
    Font kicker(&mediumFamily, 10.0f, FontStyleRegular, UnitPixel);
    if (!FontReady(kicker)) { page.fontError = true; return; }
    SolidBrush accentInk(Color(palette.accentInk));
    DrawTextBlock(graphics, page.labels[0], kicker, accentInk,
        layout.labelX, layout.kickerY, layout.labelW, 16);
    Font heading(&mediumFamily, layout.desktop ? 24.0f : 23.0f, FontStyleRegular, UnitPixel);
    if (!FontReady(heading)) { page.fontError = true; return; }
    SolidBrush text(Color(palette.text));
    DrawTextBlock(graphics, page.labels[1], heading, text,
        layout.labelX, layout.headingY, layout.labelW, layout.desktop ? 41.0f : 39.0f);
    Font body(&bodyFamily, 13.0f, FontStyleRegular, UnitPixel);
    if (!FontReady(body)) { page.fontError = true; return; }
    SolidBrush muted(Color(palette.muted));
    DrawTextBlock(graphics, page.labels[2], body, muted,
        layout.labelX, layout.descY, layout.labelW, 22.1f);
    if (page.brand && !page.squareBrand) {
        const REAL brandCenterX = layout.markX + layout.markSize / 2.0f;
        graphics.DrawImage(page.brand, RectF(brandCenterX - 60.0f, layout.markY, 120.0f, 39.0f));
    }
    Font log(&bodyFamily, 11.0f, FontStyleRegular, UnitPixel);
    if (!FontReady(log)) { page.fontError = true; return; }
    PaintCheck(graphics, palette, layout.labelX, layout.logY1);
    DrawTextBlock(graphics, page.labels[7], log, muted, layout.labelX + 14.0f, layout.logY1, layout.labelW - 14.0f, 20.0f);
    PaintShield(graphics, palette, layout.labelX, layout.logY2);
    DrawTextBlock(graphics, page.labels[8], log, muted, layout.labelX + 14.0f, layout.logY2, layout.labelW - 14.0f, 20.0f);
    Font note(&bodyFamily, layout.desktop ? 11.0f : 10.0f, FontStyleRegular, UnitPixel);
    if (!FontReady(note)) { page.fontError = true; return; }
    DrawTextBlock(graphics, page.labels[9], note, muted,
        layout.footnoteX, layout.footnoteY, layout.footnoteW, layout.footnoteH);
}

static LRESULT CALLBACK ProgressProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    auto* page = reinterpret_cast<ProgressPage*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_CREATE) {
        page = static_cast<ProgressPage*>(reinterpret_cast<CREATESTRUCTW*>(lparam)->lpCreateParams);
        SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(page));
        SetTimer(window, 1, 16, nullptr);
    }
    if (message == WM_ERASEBKGND) return 1;
    if (message == WM_TIMER) { InvalidateRect(window, nullptr, FALSE); return 0; }
    if (message == WM_MOUSEMOVE && page) {
        TRACKMOUSEEVENT tracking{sizeof(tracking), TME_LEAVE, window, 0};
        TrackMouseEvent(&tracking);
        const UINT hovered = CaptionCommand(*page, lparam);
        if (page->hoveredCommand != hovered) {
            page->hoveredCommand = hovered;
            InvalidateCaptionButtons(window, *page);
        }
        return 0;
    }
    if (message == WM_MOUSELEAVE && page) {
        page->hoveredCommand = 0;
        InvalidateCaptionButtons(window, *page);
        return 0;
    }
    if (message == WM_LBUTTONDOWN && page) {
        const int x = static_cast<short>(LOWORD(lparam));
        const int y = static_cast<short>(HIWORD(lparam));
        page->pressedCommand = CaptionCommand(*page, lparam);
        if (page->pressedCommand) {
            page->hoveredCommand = page->pressedCommand;
            SetCapture(window);
            InvalidateCaptionButtons(window, *page);
        }
        else if (x >= 0 && x < MulDiv(static_cast<int>(page->width - 96.0f), page->dpi, 96) && y >= 0 && y < MulDiv(48, page->dpi, 96)) {
            HWND parent = GetParent(window);
            ReleaseCapture(); SendMessageW(parent, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        }
        return 0;
    }
    if (message == WM_LBUTTONUP && page) {
        const UINT command = page->pressedCommand;
        page->pressedCommand = 0;
        page->hoveredCommand = CaptionCommand(*page, lparam);
        InvalidateCaptionButtons(window, *page);
        const bool activate = command && GetCapture() == window && CaptionCommand(*page, lparam) == command;
        if (GetCapture() == window) ReleaseCapture();
        if (activate) {
            if (command == SC_CLOSE) PostMessageW(GetParent(window), WM_CLOSE, 0, 0);
            else ShowWindow(GetParent(window), SW_MINIMIZE);
        }
        return 0;
    }
    if ((message == WM_CAPTURECHANGED || message == WM_CANCELMODE) && page) {
        page->pressedCommand = 0;
        InvalidateCaptionButtons(window, *page);
        if (message == WM_CANCELMODE && GetCapture() == window) ReleaseCapture();
        return 0;
    }
    if ((message == WM_PAINT || message == WM_PRINTCLIENT) && page) {
        PAINTSTRUCT paint = {};
        const bool printing = message == WM_PRINTCLIENT;
        HDC dc = printing ? reinterpret_cast<HDC>(wparam) : BeginPaint(window, &paint);
        if (printing) GetClientRect(window, &paint.rcPaint);
        {
            Graphics graphics(page->buffer);
            graphics.ScaleTransform(page->dpi / 96.0f, page->dpi / 96.0f);
            graphics.SetSmoothingMode(SmoothingModeAntiAlias);
            graphics.SetPixelOffsetMode(PixelOffsetModeHalf);
            graphics.SetTextRenderingHint(TextRenderingHintAntiAlias);
            if (page->staticBackdrop) {
                graphics.DrawImage(page->staticBackdrop, RectF(0, 0, page->width, page->height));
            }
            if (!page->failed) {
                const Palette palette = PaletteFor(page->dark);
                if (page->immediateComplete) {
                    // Only the reduced-animation path bypasses Advance(): its Tick() would restart from from.
                    page->progress.value = 100;
                } else {
                    const int stage = static_cast<int>(reinterpret_cast<INT_PTR>(GetPropW(GetParent(window), L"HarnessInstaller.Stage")));
                    const double fraction = reinterpret_cast<UINT_PTR>(GetPropW(GetParent(window), L"HarnessInstaller.ExtractProgress")) / 100.0;
                    page->progress.Advance(stage, fraction, GetTickCount64());
                }
                const int percent = static_cast<int>(page->progress.value);
                WCHAR caption[160];
                wsprintfW(caption, page->captions[page->progress.CaptionStage()], percent);
                SetWindowTextW(window, caption);
                const InstallerLayout& layout = page->layout;
                if (page->brand && page->squareBrand) {
                    const double phase = page->reduceMotion ? 0.0 : std::fmod(static_cast<double>(GetTickCount64()) / 6000.0, 1.0);
                    const double wave = page->reduceMotion ? 0.0 : 0.5 - 0.5 * std::cos(phase * 6.283185307179586);
                    const REAL driftY = page->reduceMotion ? 0.0f : static_cast<REAL>(-9.0 * wave);
                    const REAL driftAngle = page->reduceMotion ? 0.0f : static_cast<REAL>(-2.0 + 5.0 * wave);
                    const REAL centerX = layout.markX + layout.markSize / 2.0f;
                    const REAL centerY = layout.markY + layout.markSize / 2.0f + driftY;
                    PaintGlow(graphics, centerX, centerY + 12.0f, 62.0f, 38.0f, Color(0x25169BCA));
                    PaintGlow(graphics, centerX, centerY + 16.0f, 70.0f, 44.0f, Color(0x12169BCA));
                    const GraphicsState state = graphics.Save();
                    graphics.TranslateTransform(centerX, centerY);
                    graphics.RotateTransform(driftAngle);
                    graphics.SetInterpolationMode(InterpolationModeHighQualityBicubic);
                    graphics.DrawImage(page->brand, RectF(-layout.markSize / 2.0f, -layout.markSize / 2.0f,
                        layout.markSize, layout.markSize));
                    graphics.Restore(state);
                }
                const REAL labelY = layout.labelY + 10.0f;
                const REAL percentY = layout.labelY;
                const REAL trackY = layout.trackY;
                std::wstring label(caption);
                const auto percentToken = label.find(L"%d");
                if (percentToken != std::wstring::npos) {
                    label.erase(percentToken);
                    while (!label.empty() && label.back() == L' ') label.pop_back();
                }
                FontFamily& bodyFamily = *g_fontCatalog->regular;
                Font labelFont(&bodyFamily, 12.0f, FontStyleRegular, UnitPixel);
                if (!FontReady(labelFont)) { page->fontError = true; return 0; }
                SolidBrush muted(Color(palette.muted));
                DrawTextBlock(graphics, label, labelFont, muted, layout.labelX, labelY, layout.labelW - 128.0f, 20.4f, false);
                WCHAR percentText[16];
                wsprintfW(percentText, L"%d%%", percent);
                FontFamily& mediumFamily = *g_fontCatalog->medium;
                Font percentFont(&mediumFamily, 24.0f, FontStyleRegular, UnitPixel);
                if (!FontReady(percentFont)) { page->fontError = true; return 0; }
                SolidBrush accentInk(Color(palette.accentInk));
                DrawTextBlock(graphics, percentText, percentFont, accentInk, layout.labelX + layout.labelW - 128.0f, percentY, 128, 40.8f, false, StringAlignmentFar);
                SolidBrush trackFill(Color(palette.accentWash));
                FillRounded(graphics, trackFill, layout.labelX, trackY, layout.labelW, layout.trackH, layout.trackH / 2.0f);
                if (percent > 0) {
                    GraphicsPath clip;
                    AddRoundedRect(clip, layout.labelX, trackY, std::max(layout.trackH, layout.labelW * percent / 100.0f), layout.trackH, layout.trackH / 2.0f);
                    graphics.SetClip(&clip);
                    LinearGradientBrush fill(PointF(layout.labelX, trackY), PointF(layout.labelX + layout.labelW, trackY), Color(palette.accent), Color(palette.cyan));
                    graphics.FillRectangle(&fill, layout.labelX, trackY, layout.labelW, layout.trackH);
                    graphics.ResetClip();
                }
                Pen trackBorder(Color(palette.fieldBorder), 1.0f);
                StrokeRounded(graphics, trackBorder, layout.labelX, trackY, layout.labelW, layout.trackH, layout.trackH / 2.0f);
                if (page->progress.value == 100) SetPropW(GetParent(window), L"HarnessInstaller.CompletedPercent", reinterpret_cast<HANDLE>(100));
            }
            PaintCaptionButtons(graphics, *page);
        }
        BitBlt(dc, paint.rcPaint.left, paint.rcPaint.top,
               paint.rcPaint.right - paint.rcPaint.left, paint.rcPaint.bottom - paint.rcPaint.top,
               page->bufferDc, paint.rcPaint.left, paint.rcPaint.top, SRCCOPY);
        if (!printing) EndPaint(window, &paint);
        return 0;
    }
    if (message == WM_NCDESTROY && page) {
        KillTimer(window, 1);
        delete page;
    }
    return DefWindowProcW(window, message, wparam, lparam);
}

static void SplitLabels(const WCHAR* source, std::wstring (&labels)[19]) {
    std::size_t index = 0;
    std::wstring current;
    for (const WCHAR* character = source; character && *character; ++character) {
        if (*character == L'\n') {
            if (!current.empty() && current.back() == L'\r') current.pop_back();
            if (index < 19) labels[index++] = current;
            current.clear();
        } else {
            current.push_back(*character);
        }
    }
    if (!current.empty() && current.back() == L'\r') current.pop_back();
    if (index < 19) labels[index] = current;
}

// Copies the current static layer into an independent GDI+ bitmap. The Graphics
// object is destroyed before the snapshot is published or used.
static bool RefreshStaticBackdrop(ProgressPage& page) {
    if (!page.buffer) return false;
    auto* snapshot = new Bitmap(static_cast<INT>(page.buffer->GetWidth()),
        static_cast<INT>(page.buffer->GetHeight()), PixelFormat32bppPARGB);
    if (!snapshot || snapshot->GetLastStatus() != Ok) {
        delete snapshot;
        return false;
    }
    Status copyStatus = Ok;
    {
        Graphics copy(snapshot);
        copy.SetCompositingMode(CompositingModeSourceCopy);
        copy.DrawImage(page.buffer, 0, 0);
        copyStatus = copy.GetLastStatus();
    }
    if (copyStatus != Ok || snapshot->GetLastStatus() != Ok) {
        delete snapshot;
        return false;
    }
    delete page.staticBackdrop;
    page.staticBackdrop = snapshot;
    return true;
}

// Runs on the NSIS UI thread; the stock installation section runs on its worker.
// Caption colors are opaque ARGB from NSIS; failure preserves the stock page's visibility.
extern "C" __declspec(dllexport) HWND __cdecl InstallerShowProgress(HWND parent, HWND source,
        BOOL dark, UINT dpi, ARGB controlHover, ARGB controlPressed, const WCHAR* brand, const WCHAR* labels,
        const WCHAR* preparing, const WCHAR* extracting, const WCHAR* copying, const WCHAR* registering, const WCHAR* cleaning) {
    HINSTANCE module = GetModuleHandleW(nullptr);
    WNDCLASSW type = {};
    type.lpfnWndProc = ProgressProc;
    type.hInstance = module;
    type.lpszClassName = L"HarnessInstallerProgress";
    type.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    RegisterClassW(&type);
    auto* page = new (std::nothrow) ProgressPage{};
    if (!page) return nullptr;
    GdiplusStartupInputEx startup;
    if (GdiplusStartup(&page->gdiplus, &startup, nullptr) != Ok) { delete page; return nullptr; }
    page->dark = dark != FALSE;
    page->dpi = dpi;
    page->controlHover = controlHover;
    page->controlPressed = controlPressed;
    BOOL animations = TRUE;
    if (!SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &animations, 0)) animations = TRUE;
    page->reduceMotion = animations == FALSE;
    SplitLabels(labels, page->labels);
    const WCHAR* captions[] = {preparing, extracting, copying, registering, cleaning};
    for (int i = 0; i < 5; ++i) lstrcpynW(page->captions[i], captions[i], 128);
    page->brand = new Image(brand);
    if (!page->brand || page->brand->GetLastStatus() != Ok) {
        delete page; return nullptr;
    }
    page->squareBrand = page->brand->GetWidth() == page->brand->GetHeight();
    RECT client{};
    if (!GetClientRect(parent, &client) || client.right <= 0 || client.bottom <= 0) {
        delete page; return nullptr;
    }
    const int width = static_cast<int>(client.right);
    const int height = static_cast<int>(client.bottom);
    page->width = static_cast<REAL>(width) * 96.0f / static_cast<REAL>(dpi);
    page->height = static_cast<REAL>(height) * 96.0f / static_cast<REAL>(dpi);
    page->layout = ComputeInstallerLayout(page->width, page->height);
    BITMAPINFO info = {};
    info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    info.bmiHeader.biWidth = width;
    info.bmiHeader.biHeight = -height;
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    info.bmiHeader.biCompression = BI_RGB;
    void* pixels = nullptr;
    page->bufferDc = CreateCompatibleDC(nullptr);
    page->bufferBitmap = CreateDIBSection(nullptr, &info, DIB_RGB_COLORS, &pixels, nullptr, 0);
    if (!page->bufferDc || !page->bufferBitmap) { delete page; return nullptr; }
    page->previousBitmap = SelectObject(page->bufferDc, page->bufferBitmap);
    if (!page->previousBitmap) { delete page; return nullptr; }
    // Opaque pixels are shared by GDI+ drawing and the window's GDI blit.
    page->buffer = new Bitmap(width, height, width * 4, PixelFormat32bppPARGB, static_cast<BYTE*>(pixels));
    if (!page->buffer || page->buffer->GetLastStatus() != Ok) { delete page; return nullptr; }
    RenderProgressStatic(*page);
    if (page->fontError) {
        delete page;
        return nullptr;
    }
    if (!RefreshStaticBackdrop(*page)) {
        delete page;
        return nullptr;
    }
    HWND window = CreateWindowExW(0, type.lpszClassName, L"", WS_CHILD,
        0, 0, width, height, parent, nullptr, module, page);
    if (!window) { delete page; return nullptr; }
    // Keep the stock page available until the replacement is fully constructed.
    HWND stockPage = GetParent(source);
    if (!SetWindowSubclass(stockPage, HiddenPageProc, 1, 0)) {
        DestroyWindow(window); return nullptr;
    }
    ShowWindow(stockPage, SW_HIDE);
    ShowWindow(window, SW_SHOW);
    return window;
}

// NSIS calls this only after the install section failed; the modal report follows.
extern "C" __declspec(dllexport) BOOL __cdecl InstallerMarkFailed(HWND window) {
    auto* page = reinterpret_cast<ProgressPage*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (!page) return FALSE;
    if (!page->failed) {
        page->failed = true;
        RenderProgressStatic(*page);
        if (!RefreshStaticBackdrop(*page)) return FALSE;
    }
    InvalidateRect(window, nullptr, FALSE);
    UpdateWindow(window);
    const ULONGLONG started = GetTickCount64();
    while (IsWindow(window) && GetTickCount64() - started < 250) {
        MSG message;
        if (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
            if (message.message == WM_QUIT) { PostQuitMessage(static_cast<int>(message.wParam)); return FALSE; }
            TranslateMessage(&message);
            DispatchMessageW(&message);
        } else {
            MsgWaitForMultipleObjectsEx(0, nullptr, 16, QS_ALLINPUT, MWMO_INPUTAVAILABLE);
        }
    }
    return IsWindow(window) ? TRUE : FALSE;
}

// Commits the authorized success state without depending on a later WM_PAINT.
// Returns whether the property/caption state was actually committed.
static bool CommitCompletedProgress(HWND window, ProgressPage& page) {
    if (!page.progress.succeeded || page.failed) return false;
    page.progress.value = 100;
    page.immediateComplete = true;
    WCHAR caption[160] = {};
    wsprintfW(caption, page.captions[page.progress.CaptionStage()], 100);
    if (!SetWindowTextW(window, caption)) return false;
    HWND parent = GetParent(window);
    if (!SetPropW(parent, L"HarnessInstaller.CompletedPercent", reinterpret_cast<HANDLE>(100))) return false;
    InvalidateRect(window, nullptr, FALSE);
    RedrawWindow(window, nullptr, nullptr, RDW_INVALIDATE | RDW_UPDATENOW | RDW_ALLCHILDREN);
    WCHAR committed[160] = {};
    GetWindowTextW(window, committed, ARRAYSIZE(committed));
    return GetPropW(parent, L"HarnessInstaller.CompletedPercent") == reinterpret_cast<HANDLE>(100)
        && wcscmp(committed, caption) == 0;
}

// NSIS reports success. Commit the final caption/property after the bounded animation;
// drawing happens when the window is visible, without coupling success to a paint.
extern "C" __declspec(dllexport) BOOL __cdecl InstallerFinishProgress(HWND window) {
    auto* page = reinterpret_cast<ProgressPage*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (!page || page->failed) return FALSE;
    const ULONGLONG started = GetTickCount64();
    if (!SetPropW(GetParent(window), L"HarnessInstaller.Succeeded", reinterpret_cast<HANDLE>(1))) return FALSE;
    page->progress.Complete(started);
    BOOL animations = TRUE;
    if (!SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &animations, 0)) animations = TRUE;
    if (!animations) {
        return CommitCompletedProgress(window, *page) ? TRUE : FALSE;
    }
    while (IsWindow(window) && GetTickCount64() - started < 750) {
        MSG message;
        if (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
            if (message.message == WM_QUIT) { PostQuitMessage(static_cast<int>(message.wParam)); return FALSE; }
            TranslateMessage(&message);
            DispatchMessageW(&message);
        } else {
            MsgWaitForMultipleObjectsEx(0, nullptr, 16, QS_ALLINPUT, MWMO_INPUTAVAILABLE);
        }
    }
    if (!IsWindow(window) || page->failed) return FALSE;
    return CommitCompletedProgress(window, *page) && IsWindow(window) ? TRUE : FALSE;
}

// Paints the NSIS welcome/finish backdrop into a DIB for the page's static control.
// Phase 0 is the setup card, phase 1 the completion card; the caller owns the bitmap.
extern "C" __declspec(dllexport) HBITMAP __cdecl InstallerCreateBackdrop(UINT width, UINT height, UINT dpi, BOOL dark, int phase) {
    if (width < 96 || height < 96 || width > 8192 || height > 8192 || dpi < 72 || dpi > 768 || phase < 0 || phase > 4) {
        return nullptr;
    }
    ULONG_PTR token = 0;
    GdiplusStartupInputEx startup;
    if (GdiplusStartup(&token, &startup, nullptr) != Ok) return nullptr;
    const Palette palette = PaletteFor(dark != FALSE);
    BITMAPINFO info = {};
    info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    info.bmiHeader.biWidth = static_cast<LONG>(width);
    info.bmiHeader.biHeight = -static_cast<LONG>(height);
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    info.bmiHeader.biCompression = BI_RGB;
    void* pixels = nullptr;
    HDC dc = CreateCompatibleDC(nullptr);
    HBITMAP bitmap = CreateDIBSection(nullptr, &info, DIB_RGB_COLORS, &pixels, nullptr, 0);
    HBITMAP result = nullptr;
    if (dc && bitmap && pixels) {
        HGDIOBJ previous = SelectObject(dc, bitmap);
        if (previous && previous != HGDI_ERROR) {
            {
                Graphics graphics(dc);
                graphics.ScaleTransform(dpi / 96.0f, dpi / 96.0f);
                graphics.SetSmoothingMode(SmoothingModeAntiAlias);
                graphics.SetPixelOffsetMode(PixelOffsetModeHalf);
                graphics.SetInterpolationMode(InterpolationModeHighQualityBicubic);
                graphics.SetTextRenderingHint(TextRenderingHintAntiAlias);
                const REAL logicalWidth = static_cast<REAL>(width) * 96.0f / static_cast<REAL>(dpi);
                const REAL logicalHeight = static_cast<REAL>(height) * 96.0f / static_cast<REAL>(dpi);
                const InstallerLayout layout = ComputeInstallerLayout(logicalWidth, logicalHeight);
                PaintBackdrop(graphics, palette, layout, phase, false);
            }
            // Static controls consume RGB; force opaque alpha for any future DIB/print consumer.
            auto* bytes = static_cast<BYTE*>(pixels);
            const std::size_t count = static_cast<std::size_t>(width) * static_cast<std::size_t>(height);
            for (std::size_t index = 0; index < count; ++index) bytes[index * 4 + 3] = 0xFF;
            result = bitmap;
            SelectObject(dc, previous);
        }
    }
    if (dc) DeleteDC(dc);
    if (!result && bitmap) DeleteObject(bitmap);
    GdiplusShutdown(token);
    return result;
}
static int CALLBACK FontFamilyProc(const LOGFONTW*, const TEXTMETRICW*, DWORD, LPARAM data) {
    *reinterpret_cast<bool*>(data) = true;
    return 0;
}

// Confirms the exact family name is usable after private registration, not merely that a file opened.
static bool HasFontFamily(const WCHAR* face) {
    HDC dc = GetDC(nullptr);
    if (!dc) return false;
    LOGFONTW query = {};
    query.lfCharSet = DEFAULT_CHARSET;
    lstrcpynW(query.lfFaceName, face, LF_FACESIZE);
    bool found = false;
    EnumFontFamiliesExW(dc, &query, FontFamilyProc, reinterpret_cast<LPARAM>(&found), 0);
    ReleaseDC(nullptr, dc);
    return found;
}

// Loads the three bundled faces only for this process; the caller must unload them on exit.
extern "C" __declspec(dllexport) BOOL __cdecl InstallerLoadFonts(LPCWSTR light, LPCWSTR regular, LPCWSTR medium) {
    const DWORD flags = FR_PRIVATE;
    if (!light || !regular || !medium) return FALSE;
    if (AddFontResourceExW(light, flags, nullptr) == 0) return FALSE;
    if (AddFontResourceExW(regular, flags, nullptr) == 0) {
        RemoveFontResourceExW(light, flags, nullptr);
        return FALSE;
    }
    if (AddFontResourceExW(medium, flags, nullptr) == 0) {
        RemoveFontResourceExW(light, flags, nullptr);
        RemoveFontResourceExW(regular, flags, nullptr);
        return FALSE;
    }
    auto cleanupGdi = [&]() {
        RemoveFontResourceExW(light, flags, nullptr);
        RemoveFontResourceExW(regular, flags, nullptr);
        RemoveFontResourceExW(medium, flags, nullptr);
    };
    if (!HasFontFamily(kFontLight) || !HasFontFamily(kFontRegular) || !HasFontFamily(kFontMedium)) {
        cleanupGdi();
        return FALSE;
    }
    auto* catalog = new (std::nothrow) FontCatalog();
    if (!catalog) { cleanupGdi(); return FALSE; }
    GdiplusStartupInputEx startup;
    if (GdiplusStartup(&catalog->token, &startup, nullptr) != Ok) {
        delete catalog;
        cleanupGdi();
        return FALSE;
    }
    catalog->collection = new PrivateFontCollection();
    if (!catalog->collection ||
        catalog->collection->AddFontFile(light) != Ok ||
        catalog->collection->AddFontFile(regular) != Ok ||
        catalog->collection->AddFontFile(medium) != Ok) {
        delete catalog;
        cleanupGdi();
        return FALSE;
    }
    catalog->light = FindPrivateFamily(*catalog, kFontLight);
    catalog->regular = FindPrivateFamily(*catalog, kFontRegular);
    catalog->medium = FindPrivateFamily(*catalog, kFontMedium);
    if (!catalog->light || !catalog->regular || !catalog->medium ||
        catalog->light->GetLastStatus() != Ok ||
        catalog->regular->GetLastStatus() != Ok ||
        catalog->medium->GetLastStatus() != Ok) {
        delete catalog;
        cleanupGdi();
        return FALSE;
    }
    delete g_fontCatalog;
    g_fontCatalog = catalog;
    return TRUE;
}

// Releases the private faces so the temporary files can leave with the installer process.
extern "C" __declspec(dllexport) void __cdecl InstallerUnloadFonts(LPCWSTR light, LPCWSTR regular, LPCWSTR medium) {
    delete g_fontCatalog;
    g_fontCatalog = nullptr;
    const DWORD flags = FR_PRIVATE;
    if (light) RemoveFontResourceExW(light, flags, nullptr);
    if (regular) RemoveFontResourceExW(regular, flags, nullptr);
    if (medium) RemoveFontResourceExW(medium, flags, nullptr);
}

// Read-only font diagnostics for the interactive fixture; actual GDI+ families, not GDI face names.
extern "C" __declspec(dllexport) BOOL __cdecl InstallerFontDiagnostics(
        WCHAR* light, UINT lightCount, WCHAR* regular, UINT regularCount,
        WCHAR* medium, UINT mediumCount, UINT* status) {
    if (status) *status = 0;
    if (!g_fontCatalog) return FALSE;
    auto copy = [](FontFamily* family, WCHAR* buffer, UINT count) {
        if (!family || !buffer || count == 0) return false;
        WCHAR name[LF_FACESIZE] = {};
        if (family->GetFamilyName(name) != Ok) return false;
        lstrcpynW(buffer, name, static_cast<int>(count));
        return true;
    };
    bool ok = true;
    if (copy(g_fontCatalog->light, light, lightCount)) { if (status) *status |= 2; } else ok = false;
    if (copy(g_fontCatalog->regular, regular, regularCount)) { if (status) *status |= 4; } else ok = false;
    if (copy(g_fontCatalog->medium, medium, mediumCount)) { if (status) *status |= 8; } else ok = false;
    if (status) *status |= 1;
    return ok ? TRUE : FALSE;
}

static LRESULT CALLBACK FrameProc(HWND window, UINT message, WPARAM wparam,
                                 LPARAM lparam, UINT_PTR id, DWORD_PTR) {
    if (message == WM_NCCALCSIZE && wparam) return 0;
    // Activation must not repaint the standard frame over the custom client area.
    if (message == WM_NCACTIVATE) return DefSubclassProc(window, message, wparam, -1);
    if (message == WM_NCHITTEST) {
        const LRESULT hit = DefSubclassProc(window, message, wparam, lparam);
        // The installer has a fixed size; its page provides the drag area.
        return hit >= HTLEFT && hit <= HTBOTTOMRIGHT ? HTCLIENT : hit;
    }
    if (message == WM_NCDESTROY) RemoveWindowSubclass(window, FrameProc, id);
    return DefSubclassProc(window, message, wparam, lparam);
}

extern "C" __declspec(dllexport) HRESULT __cdecl InstallerApplyFrame(HWND window) {
    // NSIS may release its DLL reference before the window receives WM_NCDESTROY.
    HMODULE module = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_PIN | GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
                           reinterpret_cast<LPCWSTR>(&FrameProc), &module)) return E_FAIL;
    if (!SetWindowSubclass(window, FrameProc, 1, 0)) return E_FAIL;
    const int stockControls[] = {1, 2, 3, 1028, 1256, 1034, 1035, 1036, 1037, 1038, 1039};
    for (int id : stockControls) {
        HWND child = GetDlgItem(window, id);
        if (child) {
            if (!SetWindowSubclass(child, HiddenPageProc, 1, 0)) return E_FAIL;
            ShowWindow(child, SW_HIDE);
        }
    }
    // DWM retains native transitions; WM_NCCALCSIZE removes the visible caption.
    SetWindowLongW(window, GWL_STYLE, GetWindowLongW(window, GWL_STYLE) | WS_THICKFRAME | WS_CAPTION);
    const DWMNCRENDERINGPOLICY policy = DWMNCRP_ENABLED;
    HRESULT result = DwmSetWindowAttribute(window, DWMWA_NCRENDERING_POLICY, &policy, sizeof(policy));
    if (FAILED(result)) return result;
    const DWORD rounded = 2;
    // Windows 10 does not support the Windows 11 corner preference.
    DwmSetWindowAttribute(window, 33, &rounded, sizeof(rounded));
    const MARGINS margins = {1, 1, 1, 1};
    result = DwmExtendFrameIntoClientArea(window, &margins);
    SetWindowPos(window, nullptr, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    return result;
}

// Present the first interactive page after resource preparation without keeping the installer topmost.
extern "C" __declspec(dllexport) BOOL __cdecl InstallerPresentWelcome(HWND window) {
    if (!IsWindowVisible(window)) return FALSE;
    if (!SetWindowPos(window, HWND_TOP, 0, 0, 0, 0,
                      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)) return FALSE;
    if (GetForegroundWindow() != window) {
        FLASHWINFO flash = {sizeof(flash), window, FLASHW_TRAY | FLASHW_TIMERNOFG, 0, 0};
        FlashWindowEx(&flash);
    }
    SetPropW(window, L"HarnessInstaller.Presented", reinterpret_cast<HANDLE>(1));
    return TRUE;
}
