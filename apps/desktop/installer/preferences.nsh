; Current-user preferences are read before replacement and applied after the payload is installed.
Var InstallerShortcutEnabled
Var InstallerShortcutAvailable
Var InstallerStartupEnabled
Var InstallerStartupAvailable
Var InstallerPreferencesChosen
Var InstallerPreferencesError
Var InstallerPreviousExecutable

; Keep the builder's command-line switch and update policy; a visible choice controls new links.
!macro _InstallerSkipDesktopShortcut _a _b _t _f
    !insertmacro _isNoDesktopShortcut "" "" `${_t}` +1
    StrCmp $InstallerPreferencesChosen "1" 0 `${_f}`
    StrCpy $keepShortcuts "false"
    StrCmp $InstallerShortcutEnabled "0" `${_t}` `${_f}`
!macroend
!undef isNoDesktopShortcut
!define isNoDesktopShortcut `"" InstallerSkipDesktopShortcut ""`

Function InstallerInitPreferences
    Push $0
    Push $1
    StrCpy $InstallerShortcutEnabled 1
    StrCpy $InstallerShortcutAvailable 1
    StrCpy $InstallerStartupEnabled 0
    StrCpy $InstallerStartupAvailable 1
    StrCpy $InstallerPreferencesChosen 0
    StrCpy $InstallerPreferencesError 0
    StrCpy $InstallerPreviousExecutable ""
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $0 != ""
        StrCpy $InstallerPreviousExecutable "$0\${APP_EXECUTABLE_FILENAME}"
        !insertmacro setLinkVars
        ${IfNot} ${FileExists} "$oldDesktopLink"
            StrCpy $InstallerShortcutEnabled 0
        ${EndIf}
    ${EndIf}
    ${StdUtils.TestParameter} $1 "no-desktop-shortcut"
    ${If} $1 == "true"
        StrCpy $InstallerShortcutEnabled 0
        StrCpy $InstallerShortcutAvailable 0
    ${EndIf}
    StrCpy $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${If} $InstallerPreviousExecutable != ""
        StrCpy $0 $InstallerPreviousExecutable
    ${EndIf}
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerReadStartup(w "${APP_ID}", w r0, *i .r1) i.r0 ?c'
    ${If} $0 == 0
        StrCpy $InstallerStartupEnabled $1
    ${Else}
        StrCpy $InstallerStartupAvailable 0
        StrCpy $InstallerPreferencesError 1
        DetailPrint "Startup preference could not be read: Windows error $0"
    ${EndIf}
    Pop $1
    Pop $0
FunctionEnd

Function InstallerCapturePreferences
    ${NSD_GetState} $InstallerShortcut $InstallerShortcutEnabled
    ${NSD_GetState} $InstallerStartup $InstallerStartupEnabled
    StrCpy $InstallerPreferencesChosen 1
FunctionEnd

Function InstallerCommitPreferences
    Push $0
    ${If} $InstallerPreferencesChosen == 1
    ${AndIf} $InstallerShortcutAvailable == 1
    ${AndIf} $InstallerShortcutEnabled == 1
        ${IfNot} ${FileExists} "$newDesktopLink"
            StrCpy $InstallerPreferencesError 1
            DetailPrint "Application installed; the requested desktop shortcut was not created"
        ${EndIf}
    ${EndIf}
    ${If} $InstallerStartupAvailable == 1
        ${If} $InstallerPreferencesChosen == 1
        ${OrIf} $InstallerStartupEnabled == 1
            System::Call '$PLUGINSDIR\window-frame.dll::InstallerSetStartup(w "${APP_ID}", w "$INSTDIR\${APP_EXECUTABLE_FILENAME}", w "$InstallerPreviousExecutable", i $InstallerStartupEnabled) i.r0 ?c'
            ${If} $0 != 0
                StrCpy $InstallerPreferencesError 1
                DetailPrint "Application installed; startup preference was not saved: Windows error $0"
            ${EndIf}
        ${EndIf}
    ${EndIf}
    Pop $0
FunctionEnd
