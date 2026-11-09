// Scrolls native page controls together while retaining fixed caption controls and normal tab navigation.
#pragma once
#include <windows.h>
#include <commctrl.h>
#include <algorithm>
#include <memory>
#include <vector>

namespace installer_scroll {

struct Page;
static LRESULT CALLBACK PageProc(HWND, UINT, WPARAM, LPARAM, UINT_PTR, DWORD_PTR);
static LRESULT CALLBACK ControlProc(HWND, UINT, WPARAM, LPARAM, UINT_PTR, DWORD_PTR);
constexpr UINT_PTR subclassId = 0x5359;
constexpr int barId = 0x5359;

struct Control { HWND window; POINT origin; };

struct Page {
    HWND window = nullptr;
    HWND bar = nullptr;
    UINT dpi = 96;
    int contentHeight = 0;
    int viewportHeight = 0;
    int offset = 0;
    int wheelRemainder = 0;
    std::vector<Control> controls;

    ~Page() {
        RemoveWindowSubclass(window, PageProc, subclassId);
        for (const auto& control : controls) RemoveWindowSubclass(control.window, ControlProc, subclassId);
        if (bar) DestroyWindow(bar);
    }

    int Maximum() const { return std::max(0, contentHeight - viewportHeight); }

    bool Move(int requested) {
        const int next = std::max(0, std::min(Maximum(), requested));
        if (next == offset) return true;
        HDWP batch = BeginDeferWindowPos(static_cast<int>(controls.size()));
        if (!batch) return false;
        for (const auto& control : controls) {
            batch = DeferWindowPos(batch, control.window, nullptr, control.origin.x, control.origin.y - next,
                0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
            if (!batch) return false;
        }
        if (!EndDeferWindowPos(batch)) return false;
        offset = next;
        SCROLLINFO info{};
        info.cbSize = sizeof(info);
        info.fMask = SIF_POS;
        info.nPos = offset;
        SetScrollInfo(bar, SB_CTL, &info, TRUE);
        return true;
    }

    void Reveal(HWND control) {
        RECT rect{};
        if (!GetWindowRect(control, &rect)) return;
        MapWindowPoints(nullptr, window, reinterpret_cast<POINT*>(&rect), 2);
        const int top = MulDiv(56, static_cast<int>(dpi), 96);
        const int bottom = viewportHeight - MulDiv(12, static_cast<int>(dpi), 96);
        if (rect.top < top) Move(offset + rect.top - top);
        else if (rect.bottom > bottom) Move(offset + rect.bottom - bottom);
    }

    void Wheel(WPARAM wparam) {
        wheelRemainder += static_cast<short>(HIWORD(wparam));
        const int notches = wheelRemainder / WHEEL_DELTA;
        wheelRemainder %= WHEEL_DELTA;
        UINT lines = 3;
        SystemParametersInfoW(SPI_GETWHEELSCROLLLINES, 0, &lines, 0);
        const int distance = lines == WHEEL_PAGESCROLL ? viewportHeight - MulDiv(48, static_cast<int>(dpi), 96)
            : MulDiv(static_cast<int>(std::min(lines, 100u)) * 16, static_cast<int>(dpi), 96);
        Move(offset - notches * distance);
    }

    void Scroll(WPARAM wparam) {
        const int line = MulDiv(16, static_cast<int>(dpi), 96);
        const int page = std::max(line, viewportHeight - MulDiv(64, static_cast<int>(dpi), 96));
        switch (LOWORD(wparam)) {
        case SB_TOP: Move(0); break;
        case SB_BOTTOM: Move(Maximum()); break;
        case SB_LINEUP: Move(offset - line); break;
        case SB_LINEDOWN: Move(offset + line); break;
        case SB_PAGEUP: Move(offset - page); break;
        case SB_PAGEDOWN: Move(offset + page); break;
        case SB_THUMBTRACK:
        case SB_THUMBPOSITION: {
            SCROLLINFO info{};
            info.cbSize = sizeof(info);
            info.fMask = SIF_TRACKPOS;
            if (GetScrollInfo(bar, SB_CTL, &info)) Move(info.nTrackPos);
            break;
        }
        default: break;
        }
    }
};

static LRESULT CALLBACK ControlProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam,
        UINT_PTR id, DWORD_PTR data) {
    auto& page = *reinterpret_cast<Page*>(data);
    if (message == WM_SETFOCUS) page.Reveal(window);
    if (message == WM_GETDLGCODE && (wparam == VK_NEXT || wparam == VK_PRIOR)) {
        return DefSubclassProc(window, message, wparam, lparam) | DLGC_WANTMESSAGE;
    }
    if (message == WM_KEYDOWN && (wparam == VK_NEXT || wparam == VK_PRIOR)) {
        page.Scroll(wparam == VK_NEXT ? SB_PAGEDOWN : SB_PAGEUP);
        return 0;
    }
    if (message == WM_NCDESTROY) RemoveWindowSubclass(window, ControlProc, id);
    return DefSubclassProc(window, message, wparam, lparam);
}

static LRESULT CALLBACK PageProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam,
        UINT_PTR id, DWORD_PTR data) {
    auto* page = reinterpret_cast<Page*>(data);
    if (message == WM_MOUSEWHEEL) { page->Wheel(wparam); return 0; }
    if (message == WM_VSCROLL && reinterpret_cast<HWND>(lparam) == page->bar) { page->Scroll(wparam); return 0; }
    if (message == WM_NCDESTROY) {
        RemoveWindowSubclass(window, PageProc, id);
        delete page;
    }
    return DefSubclassProc(window, message, wparam, lparam);
}

// Reconfigure after the caller positions its controls at their unscrolled coordinates.
// The page owns all hooks and its scrollbar until destruction; excluded controls stay fixed.
inline bool Configure(HWND window, int contentHeight, UINT dpi, HWND drag, HWND minimize, HWND close) {
    if (!IsWindow(window) || contentHeight < 1 || contentHeight > 8192 || dpi < 72 || dpi > 768) return false;
    DWORD_PTR existing = 0;
    if (GetWindowSubclass(window, PageProc, subclassId, &existing)) delete reinterpret_cast<Page*>(existing);
    RECT bounds{};
    if (!GetClientRect(window, &bounds)) return false;
    if (contentHeight <= bounds.bottom) return true;
    auto page = std::make_unique<Page>();
    page->window = window;
    page->dpi = dpi;
    page->contentHeight = contentHeight;
    page->viewportHeight = bounds.bottom;
    for (HWND child = GetWindow(window, GW_CHILD); child; child = GetWindow(child, GW_HWNDNEXT)) {
        if (child == drag || child == minimize || child == close) continue;
        RECT rect{};
        if (!GetWindowRect(child, &rect)) return false;
        POINT origin{rect.left, rect.top};
        MapWindowPoints(nullptr, window, &origin, 1);
        page->controls.push_back({child, origin});
    }
    const int barWidth = MulDiv(12, static_cast<int>(dpi), 96);
    const int barTop = MulDiv(48, static_cast<int>(dpi), 96);
    page->bar = CreateWindowExW(0, L"SCROLLBAR", nullptr, WS_CHILD | WS_VISIBLE | SBS_VERT,
        bounds.right - barWidth, barTop, barWidth, std::max(1L, bounds.bottom - barTop), window,
        reinterpret_cast<HMENU>(static_cast<INT_PTR>(barId)), GetModuleHandleW(nullptr), nullptr);
    if (!page->bar) return false;
    if (!SetWindowPos(page->bar, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)) return false;
    SCROLLINFO info{};
    info.cbSize = sizeof(info);
    info.fMask = SIF_RANGE | SIF_PAGE | SIF_POS;
    info.nMax = contentHeight - 1;
    info.nPage = static_cast<UINT>(bounds.bottom);
    SetScrollInfo(page->bar, SB_CTL, &info, TRUE);
    const DWORD_PTR data = reinterpret_cast<DWORD_PTR>(page.get());
    for (const auto& control : page->controls) {
        if (!SetWindowSubclass(control.window, ControlProc, subclassId, data)) return false;
    }
    if (!SetWindowSubclass(window, PageProc, subclassId, data)) return false;
    page.release();
    return true;
}

} // namespace installer_scroll
