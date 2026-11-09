// Hidden native controls exercise the shipped scroll helper without installing or showing any window.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define UNICODE
#include <windows.h>
#include <commctrl.h>
#include <algorithm>
#include <cstdio>
#include <initializer_list>
#include <stdexcept>
#include <string>

// Standard-class initialization requires the themed Common Controls assembly.
#pragma comment(linker, "/manifestdependency:\"type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\"")

extern "C" __declspec(dllimport) BOOL __cdecl InstallerConfigurePageScroll(
    HWND page, int height, UINT dpi, HWND drag, HWND minimize, HWND close);

static void Require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

struct Window {
    HWND value = nullptr;
    void Close() {
        Require(DestroyWindow(value) != FALSE, "destroy fixture parent");
        Require(!IsWindow(value), "fixture parent no longer exists");
        value = nullptr;
    }
    ~Window() { if (value) DestroyWindow(value); }
};

static RECT Bounds(HWND child, HWND parent) {
    RECT rect{};
    Require(GetWindowRect(child, &rect) != FALSE, "read control coordinates");
    MapWindowPoints(nullptr, parent, reinterpret_cast<POINT*>(&rect), 2);
    return rect;
}

static void Exercise(int width, int height, UINT dpi) {
    const auto px = [dpi](int value) { return MulDiv(value, static_cast<int>(dpi), 96); };
    Window parent;
    parent.value = CreateWindowExW(0, L"STATIC", L"Hidden Suiyi scroll fixture", WS_POPUP,
        0, 0, px(width), px(height), nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    Require(parent.value != nullptr, "create hidden fixture parent");
    const HWND page = CreateWindowExW(0, L"STATIC", nullptr, WS_CHILD,
        0, 0, px(width), px(height), parent.value, nullptr, GetModuleHandleW(nullptr), nullptr);
    Require(page != nullptr, "create hidden fixture page");
    const auto child = [&](LPCWSTR type, int x, int y, int w, int h) {
        HWND control = CreateWindowExW(0, type, L"Fixture control", WS_CHILD | WS_VISIBLE | WS_TABSTOP,
            px(x), px(y), px(w), px(h), page, nullptr, GetModuleHandleW(nullptr), nullptr);
        Require(control != nullptr, "create fixture control");
        return control;
    };
    const HWND drag = child(L"STATIC", 0, 0, width - 96, 48);
    const HWND minimize = child(L"BUTTON", width - 96, 8, 40, 32);
    const HWND close = child(L"BUTTON", width - 52, 8, 40, 32);
    const bool desktop = width > 640;
    const int actionY = desktop ? 736 : 797;
    const int fieldY = desktop ? 388 : 447;
    const int contentHeight = std::max(height, desktop ? 875 : 937);
    const HWND backdrop = child(L"STATIC", 0, 0, width, contentHeight);
    const HWND action = child(L"BUTTON", 40, actionY, 134, 42);
    const HWND field = child(L"EDIT", 40, fieldY, 200, 30);
    const HWND footer = child(L"STATIC", 40, contentHeight - 58, 240, 34);
    const int maximum = px(contentHeight - height);
    const RECT caption = Bounds(close, page);
    Require(InstallerConfigurePageScroll(page, px(contentHeight), dpi, drag, minimize, close) != FALSE,
        "configure native scrolling");
    Require(!IsWindowVisible(parent.value), "fixture must remain hidden");
    HWND bar = GetDlgItem(page, 0x5359);
    if (maximum == 0) {
        Require(!bar, "fitting page has no scrollbar");
        Require(Bounds(action, page).top == px(actionY), "fitting page keeps its layout");
        parent.Close();
        Require(!IsWindow(page) && !IsWindow(action), "fitting page children are destroyed");
        return;
    }
    Require(bar != nullptr, "overflowing page exposes scrollbar");
    Require(GetWindow(bar, GW_HWNDPREV) == nullptr, "scrollbar stays above painted backdrop");
    SendMessageW(page, WM_VSCROLL, SB_BOTTOM, reinterpret_cast<LPARAM>(bar));
    Require(Bounds(action, page).top == px(actionY) - maximum, "bottom action follows the scroll offset");
    Require(Bounds(footer, page).bottom <= px(height), "footer is reachable");
    Require(Bounds(backdrop, page).top == -maximum, "painted backdrop follows controls");
    Require(Bounds(close, page).top == caption.top && Bounds(close, page).left == caption.left,
        "close control remains fixed");
    SendMessageW(page, WM_VSCROLL, SB_BOTTOM, reinterpret_cast<LPARAM>(bar));
    Require(Bounds(action, page).top == px(actionY) - maximum, "bottom offset is bounded");
    SendMessageW(page, WM_VSCROLL, SB_TOP, reinterpret_cast<LPARAM>(bar));
    Require(Bounds(action, page).top == px(actionY), "top restores original coordinates");

    UINT lines = 3;
    SystemParametersInfoW(SPI_GETWHEELSCROLLLINES, 0, &lines, 0);
    SendMessageW(page, WM_MOUSEWHEEL, MAKEWPARAM(0, static_cast<WORD>(-WHEEL_DELTA / 2)), 0);
    Require(Bounds(action, page).top == px(actionY), "partial wheel delta is retained");
    SendMessageW(page, WM_MOUSEWHEEL, MAKEWPARAM(0, static_cast<WORD>(-WHEEL_DELTA / 2)), 0);
    const int distance = lines == WHEEL_PAGESCROLL ? px(height - 48) : px(static_cast<int>(std::min(lines, 100u)) * 16);
    Require(Bounds(action, page).top == px(actionY) - std::min(maximum, distance), "wheel follows user scroll settings");
    SendMessageW(action, WM_KEYDOWN, VK_PRIOR, 0);
    Require(Bounds(action, page).top == px(actionY), "Page Up reaches the top");
    SendMessageW(action, WM_KEYDOWN, VK_NEXT, 0);
    Require(Bounds(action, page).bottom <= px(height), "Page Down exposes the action");

    // Focus notifications exercise automatic reveal without activating the hidden fixture.
    SendMessageW(page, WM_VSCROLL, SB_TOP, reinterpret_cast<LPARAM>(bar));
    SendMessageW(footer, WM_SETFOCUS, 0, 0);
    Require(Bounds(footer, page).bottom <= px(height - 12), "focus reveals a clipped control");
    SendMessageW(field, WM_SETFOCUS, 0, 0);
    Require(Bounds(field, page).top >= px(56), "focused field stays below caption controls");
    SendMessageW(field, WM_KILLFOCUS, 0, 0);
    Require(!IsWindowVisible(parent.value), "focus reveal must not show fixture");

    // A phase change owns its new unscrolled coordinates before reconfiguration.
    SendMessageW(page, WM_VSCROLL, SB_TOP, reinterpret_cast<LPARAM>(bar));
    Require(InstallerConfigurePageScroll(page, px(height), dpi, drag, minimize, close) != FALSE,
        "reconfigure a page that now fits");
    Require(!IsWindow(bar) && !GetDlgItem(page, 0x5359), "obsolete scrollbar is destroyed");
    SendMessageW(action, WM_KEYDOWN, VK_NEXT, 0);
    Require(Bounds(action, page).top == px(actionY), "old focus and keyboard hooks are removed");
    Require(InstallerConfigurePageScroll(page, px(contentHeight), dpi, drag, minimize, close) != FALSE,
        "restore scrolling before teardown");
    bar = GetDlgItem(page, 0x5359);
    Require(bar != nullptr, "restored scrollbar exists");
    parent.Close();
    Require(!IsWindow(page) && !IsWindow(action) && !IsWindow(bar), "page teardown destroys controls and scrollbar");
}

int wmain() {
    try {
        const HMODULE executable = GetModuleHandleW(nullptr);
        const HRSRC manifest = FindResourceW(executable, MAKEINTRESOURCEW(1), MAKEINTRESOURCEW(24));
        Require(manifest != nullptr, "embedded executable manifest exists");
        const HGLOBAL resource = LoadResource(executable, manifest);
        Require(resource != nullptr, "load executable manifest");
        const auto* bytes = static_cast<const char*>(LockResource(resource));
        Require(bytes != nullptr, "read executable manifest");
        const std::string xml(bytes, SizeofResource(executable, manifest));
        Require(xml.find("Microsoft.Windows.Common-Controls") != std::string::npos
            && xml.find("6.0.0.0") != std::string::npos, "embedded themed controls dependency");
        INITCOMMONCONTROLSEX init{sizeof(init), ICC_STANDARD_CLASSES};
        Require(InitCommonControlsEx(&init) != FALSE, "initialize common controls");
        Require(!InstallerConfigurePageScroll(nullptr, 900, 96, nullptr, nullptr, nullptr), "reject invalid page");
        for (const UINT dpi : {96u, 192u}) {
            Exercise(1440, 1000, dpi);
            Exercise(1280, 800, dpi);
            Exercise(390, 844, dpi);
            Exercise(390, 500, dpi);
        }
        std::puts("NATIVE_INSTALLER_SCROLL_PASS: eight hidden-window cases; no desktop windows shown");
        return 0;
    } catch (const std::exception& error) {
        std::fprintf(stderr, "NATIVE_INSTALLER_SCROLL_FAIL: %s\n", error.what());
        return 1;
    }
}
