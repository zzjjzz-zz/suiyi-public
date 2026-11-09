// Current-user startup registration; an existing entry is replaced only when it names this installation.
#pragma once
#include <windows.h>
#include <cwchar>
#include <string>

namespace startup_preferences {

struct Key {
    HKEY value = nullptr;
    Key() = default;
    Key(const Key&) = delete;
    Key& operator=(const Key&) = delete;
    ~Key() { if (value) RegCloseKey(value); }
};

inline DWORD Command(LPCWSTR executable, std::wstring& command) {
    if (!executable || !*executable) return ERROR_INVALID_PARAMETER;
    // Run commands are limited to 260 characters, including both path quotes.
    if (wcslen(executable) > 258) return ERROR_FILENAME_EXCED_RANGE;
    if (wcschr(executable, L'"')) return ERROR_INVALID_NAME;
    command = L"\"" + std::wstring(executable) + L"\"";
    return ERROR_SUCCESS;
}

inline DWORD Read(HKEY key, LPCWSTR name, std::wstring& command, bool& exists) {
    exists = false;
    command.clear();
    WCHAR value[261] = {};
    DWORD bytes = sizeof(value);
    const LSTATUS result = RegGetValueW(key, nullptr, name, RRF_RT_REG_SZ, nullptr, value, &bytes);
    if (result == ERROR_FILE_NOT_FOUND) return ERROR_SUCCESS;
    if (result != ERROR_SUCCESS) return static_cast<DWORD>(result);
    command = value;
    exists = true;
    return ERROR_SUCCESS;
}

inline bool SameCommand(const std::wstring& first, const std::wstring& second) {
    return CompareStringOrdinal(first.c_str(), -1, second.c_str(), -1, TRUE) == CSTR_EQUAL;
}

// The caller owns the open key. Unrelated values, arguments and unrecognized entry data stay untouched.
inline DWORD Apply(HKEY key, LPCWSTR name, const std::wstring& command,
        const std::wstring& previousCommand, bool enabled) {
    std::wstring current;
    bool exists = false;
    const DWORD read = Read(key, name, current, exists);
    if (read != ERROR_SUCCESS) return read;
    if (exists && !SameCommand(current, command) &&
        (previousCommand.empty() || !SameCommand(current, previousCommand))) return ERROR_ALREADY_EXISTS;
    if (enabled) {
        return static_cast<DWORD>(RegSetValueExW(key, name, 0, REG_SZ,
            reinterpret_cast<const BYTE*>(command.c_str()), static_cast<DWORD>((command.size() + 1) * sizeof(WCHAR))));
    }
    if (!exists) return ERROR_SUCCESS;
    return static_cast<DWORD>(RegDeleteValueW(key, name));
}

inline DWORD ReadEnabled(LPCWSTR name, LPCWSTR executable, BOOL& enabled) {
    enabled = FALSE;
    if (!name || !*name) return ERROR_INVALID_PARAMETER;
    std::wstring expected;
    DWORD result = Command(executable, expected);
    if (result != ERROR_SUCCESS) return result;
    Key key;
    result = static_cast<DWORD>(RegOpenKeyExW(HKEY_CURRENT_USER,
        L"Software\\Microsoft\\Windows\\CurrentVersion\\Run", 0, KEY_QUERY_VALUE | KEY_WOW64_64KEY, &key.value));
    if (result == ERROR_FILE_NOT_FOUND) return ERROR_SUCCESS;
    if (result != ERROR_SUCCESS) return result;
    std::wstring current;
    bool exists = false;
    result = Read(key.value, name, current, exists);
    if (result != ERROR_SUCCESS) return result;
    if (exists && !SameCommand(current, expected)) return ERROR_ALREADY_EXISTS;
    enabled = exists ? TRUE : FALSE;
    return ERROR_SUCCESS;
}

inline DWORD SetEnabled(LPCWSTR name, LPCWSTR executable, LPCWSTR previousExecutable, bool enabled) {
    if (!name || !*name) return ERROR_INVALID_PARAMETER;
    std::wstring command;
    DWORD result = Command(executable, command);
    if (result != ERROR_SUCCESS) return result;
    std::wstring previousCommand;
    if (previousExecutable && *previousExecutable) {
        result = Command(previousExecutable, previousCommand);
        if (result != ERROR_SUCCESS) return result;
    }
    Key key;
    constexpr REGSAM access = KEY_QUERY_VALUE | KEY_SET_VALUE | KEY_WOW64_64KEY;
    if (enabled) {
        result = static_cast<DWORD>(RegCreateKeyExW(HKEY_CURRENT_USER,
            L"Software\\Microsoft\\Windows\\CurrentVersion\\Run", 0, nullptr, 0, access, nullptr, &key.value, nullptr));
    } else {
        result = static_cast<DWORD>(RegOpenKeyExW(HKEY_CURRENT_USER,
            L"Software\\Microsoft\\Windows\\CurrentVersion\\Run", 0, access, &key.value));
        if (result == ERROR_FILE_NOT_FOUND) return ERROR_SUCCESS;
    }
    if (result != ERROR_SUCCESS) return result;
    return Apply(key.value, name, command, previousCommand, enabled);
}

} // namespace startup_preferences
