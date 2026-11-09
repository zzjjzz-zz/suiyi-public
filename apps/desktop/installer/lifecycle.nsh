Var InstallerProgressWindow

Function InstallerGuiInit
    HideWindow
    !ifdef DSH_SUIYI
        StrCpy $InstallerDisplayBrand "$(INSTALLER_SUIYI_BRAND)"
    !else
        StrCpy $InstallerDisplayBrand "${PRODUCT_NAME}"
    !endif
    Call InstallerComposeTitle
    InitPluginsDir
    ; Private, per-process faces; the files leave with $PLUGINSDIR and no system font is installed.
    File "/oname=$PLUGINSDIR\NotoSansSC-Light.ttf" "${__FILEDIR__}\fonts\NotoSansSC-Light.ttf"
    File "/oname=$PLUGINSDIR\NotoSansSC-Regular.ttf" "${__FILEDIR__}\fonts\NotoSansSC-Regular.ttf"
    File "/oname=$PLUGINSDIR\NotoSansSC-Medium.ttf" "${__FILEDIR__}\fonts\NotoSansSC-Medium.ttf"
    !ifdef DSH_SUIYI
        ; Square prototype ribbon mark for the progress page; official keeps its horizontal brand.
        File "/oname=$PLUGINSDIR\mark-2x.png" "${INSTALLER_BUILD_DIR}\mark-2x.png"
        File "/oname=$PLUGINSDIR\mark-dark-2x.png" "${INSTALLER_BUILD_DIR}\mark-dark-2x.png"
    !endif
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerLoadFonts(w "$PLUGINSDIR\NotoSansSC-Light.ttf", w "$PLUGINSDIR\NotoSansSC-Regular.ttf", w "$PLUGINSDIR\NotoSansSC-Medium.ttf") i.r0 ?c'
    ${If} $0 == 0
        MessageBox MB_OK|MB_ICONSTOP "$(INSTALLER_FONT_ERROR)"
        SetErrorLevel 2
        Quit
    ${EndIf}
    System::Call 'user32::SetWindowLongW(p $HWNDPARENT, i -16, i 0x800A0000)'
    System::Call 'user32::GetDC(p $HWNDPARENT) p.r0'
    System::Call 'gdi32::GetDeviceCaps(p r0, i 88) i.s'
    Pop $InstallerDpi
    System::Call 'user32::ReleaseDC(p $HWNDPARENT, p r0)'
    System::Alloc 16
    Pop $6
    System::Call 'user32::SystemParametersInfoW(i 0x30, i 0, p r6, i 0) i.r4'
    ${If} $4 == 0
        System::Call 'user32::GetSystemMetrics(i 0) i.R2'
        System::Call 'user32::GetSystemMetrics(i 1) i.R3'
        StrCpy $R0 0
        StrCpy $R1 0
    ${Else}
        System::Call '*$6(i .R0, i .R1, i .R2, i .R3)'
    ${EndIf}
    System::Free $6
    IntOp $4 $R2 - $R0
    IntOp $5 $R3 - $R1
    System::Call 'kernel32::MulDiv(i r4, i 96, i $InstallerDpi) i.r6'
    ${If} $6 >= 1360
        System::Call 'kernel32::MulDiv(i 1440, i $InstallerDpi, i 96) i.r2'
        System::Call 'kernel32::MulDiv(i 1000, i $InstallerDpi, i 96) i.r3'
    ${ElseIf} $6 >= 1000
        System::Call 'kernel32::MulDiv(i 1280, i $InstallerDpi, i 96) i.r2'
        System::Call 'kernel32::MulDiv(i 800, i $InstallerDpi, i 96) i.r3'
    ${ElseIf} $6 >= 500
        System::Call 'kernel32::MulDiv(i 600, i $InstallerDpi, i 96) i.r2'
        System::Call 'kernel32::MulDiv(i 844, i $InstallerDpi, i 96) i.r3'
    ${Else}
        System::Call 'kernel32::MulDiv(i 390, i $InstallerDpi, i 96) i.r2'
        System::Call 'kernel32::MulDiv(i 844, i $InstallerDpi, i 96) i.r3'
    ${EndIf}
    ${If} $2 > $4
        StrCpy $2 $4
    ${EndIf}
    ${If} $3 > $5
        StrCpy $3 $5
    ${EndIf}
    StrCpy $InstallerWindowWidthPx $2
    StrCpy $InstallerWindowHeightPx $3
    IntOp $0 $4 - $2
    IntOp $0 $0 / 2
    IntOp $0 $0 + $R0
    IntOp $1 $5 - $3
    IntOp $1 $1 / 2
    IntOp $1 $1 + $R1
    System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r0, i r1, i r2, i r3, i 0x34)'
    Call InstallerQueryMetrics
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerApplyFrame(p $HWNDPARENT) i.r0 ?c'
    ${If} $0 < 0
        MessageBox MB_OK|MB_ICONSTOP "$(INSTALLER_UI_ERROR)"
        SetErrorLevel 2
        Quit
    ${EndIf}
    GetDlgItem $0 $HWNDPARENT 1
    ShowWindow $0 0
    GetDlgItem $0 $HWNDPARENT 2
    ShowWindow $0 0
    GetDlgItem $0 $HWNDPARENT 3
    ShowWindow $0 0
    GetDlgItem $0 $HWNDPARENT 1028
    ShowWindow $0 0
    GetDlgItem $0 $HWNDPARENT 1256
    ShowWindow $0 0
FunctionEnd

Function InstallerWelcome
    ${If} ${isUpdated}
        Abort
    ${EndIf}
    StrCpy $InstallerPhase "platform"
    Call InstallerCreate
FunctionEnd

Function InstallerBeforeInstall
    SetAutoClose true
    Call InstallerPreflight
    ${If} $InstallerError != ""
        MessageBox MB_OK|MB_ICONEXCLAMATION "$InstallerError" /SD IDOK
        SetErrorLevel 2
        Quit
    ${EndIf}
    Call InstallerCheckAppRunning
FunctionEnd

Function InstallerProgressShow
    ; Only the stock worker executes installation; this overlay runs on the UI thread.
    ShowWindow $mui.InstFilesPage 0
    StrCpy $0 0
    StrCpy $1 "$PLUGINSDIR\brand-2x.bmp"
    !ifdef DSH_SUIYI
        StrCpy $1 "$PLUGINSDIR\mark-2x.png"
    !endif
    ${If} $InstallerTheme == "dark"
        StrCpy $0 1
        StrCpy $1 "$PLUGINSDIR\brand-dark-2x.bmp"
        !ifdef DSH_SUIYI
            StrCpy $1 "$PLUGINSDIR\mark-dark-2x.png"
        !endif
    ${EndIf}
    ; Nineteen newline-separated strings: kicker, heading, description, four step
    ; labels, two log lines, footnote, failure heading/description, title/subtitle,
    ; four rail step descriptions, then explicit display brand (never parsed from title).
    StrCpy $2 "$(INSTALLER_KICKER_INSTALL)$\r$\n$(INSTALLER_PROGRESS_HEADING)$\r$\n$(INSTALLER_PROGRESS_DESC)$\r$\n$(INSTALLER_STEP_PREPARE)$\r$\n$(INSTALLER_STEP_SETUP)$\r$\n$(INSTALLER_STEP_INSTALL)$\r$\n$(INSTALLER_STEP_FINISH)$\r$\n$(INSTALLER_PROGRESS_LOG_READY)$\r$\n$(INSTALLER_PROGRESS_LOG_SCOPE)$\r$\n$(INSTALLER_PROGRESS_NOTE)$\r$\n$(INSTALLER_FAILED_HEADING)$\r$\n$(INSTALLER_FAILED)$\r$\n$InstallerComposedTitle$\r$\n$(INSTALLER_PAGE_SUBTITLE)$\r$\n$(INSTALLER_STEP_PREPARE_DESC)$\r$\n$(INSTALLER_STEP_SETUP_DESC)$\r$\n$(INSTALLER_STEP_INSTALL_DESC)$\r$\n$(INSTALLER_STEP_FINISH_DESC)$\r$\n$InstallerDisplayBrand"
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerShowProgress(p $HWNDPARENT, p $mui.InstFilesPage.ProgressBar, i r0, i $InstallerDpi, i $InstallerCaptionHover, i $InstallerCaptionPressed, w r1, w r2, w "$(INSTALLER_NATIVE_PROGRESS)", w "$(INSTALLER_PROGRESS_EXTRACT)", w "$(INSTALLER_PROGRESS_COPY)", w "$(INSTALLER_PROGRESS_REGISTER)", w "$(INSTALLER_PROGRESS_CLEAN)") p.s ?c'
    Pop $InstallerProgressWindow
    ${If} $InstallerProgressWindow == 0
        MessageBox MB_OK|MB_ICONSTOP "$(INSTALLER_UI_ERROR)"
        SetErrorLevel 2
        Quit
    ${EndIf}
    System::Call 'user32::SetPropW(p $HWNDPARENT, w "HarnessInstaller.Ready", p 1)'
    ShowWindow $HWNDPARENT 5
FunctionEnd

Function .onInstFailed
    ; Present the designed failure state before the actionable modal report.
    ${If} $InstallerProgressWindow != 0
        System::Call '$PLUGINSDIR\window-frame.dll::InstallerMarkFailed(p $InstallerProgressWindow) i.r0 ?c'
    ${EndIf}
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(INSTALLER_FAILED)" /SD IDOK
    Call InstallerUnloadFonts
    SetErrorLevel 2
    Quit
FunctionEnd

Function InstallerFinish
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerFinishProgress(p $InstallerProgressWindow) i.r0 ?c'
    ${If} $0 == 0
        Quit
    ${EndIf}
    System::Call 'user32::DestroyWindow(p $InstallerProgressWindow)'
    StrCpy $InstallerPhase "success"
    Call InstallerCreate
FunctionEnd

; Releases the private faces after the final page closes or an install failure.
Function InstallerUnloadFonts
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerUnloadFonts(w "$PLUGINSDIR\NotoSansSC-Light.ttf", w "$PLUGINSDIR\NotoSansSC-Regular.ttf", w "$PLUGINSDIR\NotoSansSC-Medium.ttf") ?c'
FunctionEnd
