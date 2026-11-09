// Exercises the shipped registration logic in a unique disposable HKCU key, never the real Run key.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define UNICODE
#include <windows.h>
#include <objbase.h>
#include <cstdio>
#include <initializer_list>
#include <stdexcept>
#include "../installer/startup-preferences.h"

static void Require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

struct RegistryFixture {
    startup_preferences::Key parent;
    startup_preferences::Key key;
    std::wstring name;
    bool owned = false;

    void Create() {
        GUID id{};
        Require(SUCCEEDED(CoCreateGuid(&id)), "create fixture id");
        WCHAR text[40]{};
        Require(StringFromGUID2(id, text, 40) != 0, "format fixture id");
        name = L"SuiyiInstallerPreferenceTest-" + std::wstring(text);
        Require(RegOpenKeyExW(HKEY_CURRENT_USER, L"Software", 0,
            KEY_READ | KEY_WRITE | DELETE | KEY_WOW64_64KEY, &parent.value) == ERROR_SUCCESS, "open fixture parent");
        DWORD disposition = 0;
        Require(RegCreateKeyExW(parent.value, name.c_str(), 0, nullptr, REG_OPTION_VOLATILE,
            KEY_READ | KEY_WRITE | KEY_WOW64_64KEY, nullptr, &key.value, &disposition) == ERROR_SUCCESS, "create fixture key");
        Require(disposition == REG_CREATED_NEW_KEY, "fixture must be new");
        owned = true;
    }

    DWORD Remove() {
        if (!key.value) return ERROR_SUCCESS;
        RegCloseKey(key.value);
        key.value = nullptr;
        if (!owned) return ERROR_SUCCESS;
        return static_cast<DWORD>(RegDeleteTreeW(parent.value, name.c_str()));
    }

    ~RegistryFixture() { if (Remove() != ERROR_SUCCESS) std::fputs("Fixture cleanup failed\n", stderr); }
};

static void Write(HKEY key, LPCWSTR name, const std::wstring& command) {
    Require(RegSetValueExW(key, name, 0, REG_SZ, reinterpret_cast<const BYTE*>(command.c_str()),
        static_cast<DWORD>((command.size() + 1) * sizeof(WCHAR))) == ERROR_SUCCESS, "write fixture value");
}

static void Expect(HKEY key, LPCWSTR name, const std::wstring& expected, bool present = true) {
    std::wstring actual;
    bool exists = false;
    Require(startup_preferences::Read(key, name, actual, exists) == ERROR_SUCCESS, "read fixture value");
    Require(exists == present && actual == expected, "registration differs from expected command");
}

static void Exercise(RegistryFixture& fixture) {
    constexpr LPCWSTR entry = L"com.example.suiyi";
    const HKEY key = fixture.key.value;
    std::wstring command;
    Require(startup_preferences::Command(L"C:\\Program Files\\Suiyi\\suiyi.exe", command) == ERROR_SUCCESS,
        "accept executable with spaces");
    Require(command == L"\"C:\\Program Files\\Suiyi\\suiyi.exe\"", "quote executable");
    std::wstring previous;
    Require(startup_preferences::Command(L"C:\\Previous\\suiyi.exe", previous) == ERROR_SUCCESS, "accept previous path");
    Write(key, L"neighbor", L"preserved");

    Expect(key, entry, L"", false);
    Require(startup_preferences::Apply(key, entry, command, L"", false) == ERROR_SUCCESS, "default off is a no-op");
    Expect(key, entry, L"", false);
    Require(startup_preferences::Apply(key, entry, command, L"", true) == ERROR_SUCCESS, "enable startup");
    Expect(key, entry, command);
    Require(startup_preferences::Apply(key, entry, command, L"", true) == ERROR_SUCCESS, "repeat enable");
    Require(startup_preferences::Apply(key, entry, command, L"", false) == ERROR_SUCCESS, "disable owned startup");
    Expect(key, entry, L"", false);

    Write(key, entry, previous);
    Require(startup_preferences::Apply(key, entry, command, previous, true) == ERROR_SUCCESS, "migrate known installation");
    Expect(key, entry, command);
    Write(key, entry, L"\"c:\\program files\\suiyi\\SUIYI.EXE\"");
    Require(startup_preferences::Apply(key, entry, command, L"", false) == ERROR_SUCCESS, "Windows path case is ignored");
    Expect(key, entry, L"", false);
    Write(key, entry, previous);
    Require(startup_preferences::Apply(key, entry, command, previous, false) == ERROR_SUCCESS, "disable previous installation");
    Expect(key, entry, L"", false);

    for (const auto& foreign : {L"\"C:\\Other\\other.exe\"", L"\"C:\\Program Files\\Suiyi\\suiyi.exe\" --custom"}) {
        Write(key, entry, foreign);
        for (const bool enabled : {false, true}) {
            Require(startup_preferences::Apply(key, entry, command, previous, enabled) == ERROR_ALREADY_EXISTS,
                "preserve foreign entry and unrecognized arguments");
            Expect(key, entry, foreign);
        }
    }

    const DWORD binary = 1234;
    Require(RegSetValueExW(key, entry, 0, REG_DWORD, reinterpret_cast<const BYTE*>(&binary), sizeof(binary)) == ERROR_SUCCESS,
        "write wrong registry type");
    Require(startup_preferences::Apply(key, entry, command, previous, true) != ERROR_SUCCESS, "reject wrong registry type");
    DWORD actual = 0, bytes = sizeof(actual);
    Require(RegGetValueW(key, nullptr, entry, RRF_RT_REG_DWORD, nullptr, &actual, &bytes) == ERROR_SUCCESS && actual == binary,
        "preserve wrong registry type");
    const std::wstring oversized(400, L'x');
    Write(key, entry, oversized);
    Require(startup_preferences::Apply(key, entry, command, previous, false) == ERROR_MORE_DATA, "reject oversized entry");
    WCHAR retained[401]{};
    bytes = sizeof(retained);
    Require(RegGetValueW(key, nullptr, entry, RRF_RT_REG_SZ, nullptr, retained, &bytes) == ERROR_SUCCESS && retained == oversized,
        "preserve oversized entry");

    Write(key, entry, command);
    startup_preferences::Key readOnly;
    Require(RegOpenKeyExW(fixture.parent.value, fixture.name.c_str(), 0, KEY_QUERY_VALUE | KEY_WOW64_64KEY,
        &readOnly.value) == ERROR_SUCCESS, "open read-only fixture");
    Require(startup_preferences::Apply(readOnly.value, entry, command, L"", false) == ERROR_ACCESS_DENIED,
        "report denied removal");
    Require(startup_preferences::Apply(readOnly.value, entry, command, L"", true) == ERROR_ACCESS_DENIED,
        "report denied registration");
    Expect(key, entry, command);
    Expect(key, L"neighbor", L"preserved");

    Require(startup_preferences::Command(nullptr, command) == ERROR_INVALID_PARAMETER, "reject null path");
    Require(startup_preferences::Command(L"", command) == ERROR_INVALID_PARAMETER, "reject empty path");
    Require(startup_preferences::Command(L"C:\\bad\"path.exe", command) == ERROR_INVALID_NAME, "reject embedded quote");
    Require(startup_preferences::Command(std::wstring(258, L'a').c_str(), command) == ERROR_SUCCESS && command.size() == 260,
        "allow maximum Run command length");
    Require(startup_preferences::Command(std::wstring(259, L'a').c_str(), command) == ERROR_FILENAME_EXCED_RANGE,
        "reject oversized Run command");
}

int wmain() {
    try {
        RegistryFixture fixture;
        fixture.Create();
        Exercise(fixture);
        Require(fixture.Remove() == ERROR_SUCCESS, "remove fixture key");
        startup_preferences::Key removed;
        Require(RegOpenKeyExW(fixture.parent.value, fixture.name.c_str(), 0, KEY_READ | KEY_WOW64_64KEY,
            &removed.value) == ERROR_FILE_NOT_FOUND, "fixture key no longer exists");
        std::puts("NATIVE_STARTUP_PREFERENCES_PASS: owned temporary HKCU key removed; real Run key untouched");
        return 0;
    } catch (const std::exception& error) {
        std::fprintf(stderr, "NATIVE_STARTUP_PREFERENCES_FAIL: %s\n", error.what());
        return 1;
    }
}
