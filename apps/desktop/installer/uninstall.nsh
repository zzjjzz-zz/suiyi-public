; Electron user data and updater downloads leave with the application; the Harness home is never touched.
!include FileFunc.nsh
Var UnTarget
Var UnHome

; Upgrades preserve the preference until the replacing installer registers its final path.
Function un.RemoveStartupPreference
  ${If} ${isUpdated}
    Return
  ${EndIf}
  Push $0
  System::Call '$PLUGINSDIR\window-frame.dll::InstallerSetStartup(w "${APP_ID}", w "$INSTDIR\${APP_EXECUTABLE_FILENAME}", w "", i 0) i.r0 ?c'
  ${If} $0 != 0
  ${AndIf} $0 != 183
    DetailPrint "Startup preference was not removed: Windows error $0"
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(INSTALLER_STARTUP_REMOVE_FAILED)" /SD IDOK
  ${EndIf}
  Pop $0
FunctionEnd

; The helper refuses unsafe roots, the installation and the Harness home, and never descends into reparse points;
; a locked file leaves residue and never fails the uninstall. customCheckAppRunning extracts window-frame.dll first.
Function un.RemoveData
  System::Call '$PLUGINSDIR\window-frame.dll::UninstallRemoveData(w "$UnTarget", w "$INSTDIR", w "$UnHome") ?c'
FunctionEnd

Function un.CleanData
  !ifdef DSH_SUIYI
    ; Preserve all Suiyi state; never run legacy package-name or dsh-home cleanup.
    Return
  !endif
  ${If} ${isUpdated}
    Return
  ${EndIf}
  ; The installer runs an older uninstaller with /KEEP_APP_DATA when replacing it from another directory.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/KEEP_APP_DATA" $R1
  ${IfNot} ${Errors}
    Return
  ${EndIf}
  ; Only a DSH_HOME published as a Windows environment variable is visible here.
  ReadEnvStr $UnHome DSH_HOME
  ClearErrors
  StrCpy $UnTarget "$APPDATA\${PRODUCT_FILENAME}"
  Call un.RemoveData
  !ifdef APP_PACKAGE_NAME
    ; Electron derives user data from the package name; a scoped name nests it one directory deeper.
    StrCpy $UnTarget "$APPDATA\${APP_PACKAGE_NAME}"
    Call un.RemoveData
    System::Call '$PLUGINSDIR\window-frame.dll::UninstallRemoveEmptyParents(w "$UnTarget", w "$APPDATA") ?c'
  !endif
  StrCpy $UnTarget "$LOCALAPPDATA\${DSH_UPDATER_CACHE_NAME}"
  Call un.RemoveData
FunctionEnd
