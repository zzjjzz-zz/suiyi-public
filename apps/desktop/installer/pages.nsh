; Native welcome and finish pages for the electron-builder installer.
; The 600px window uses the prototype's stacked install cascade: page heading,
; a four-step strip, then the form card. Native controls own every editable or
; actionable element; the backdrop only paints surfaces, step tiles and icons.
!ifndef HARNESS_INSTALLER_UI
!define HARNESS_INSTALLER_UI
!define WM_NOTIFY_OUTER_NEXT 0x408
!ifndef SS_ENDELLIPSIS
    !define SS_ENDELLIPSIS 0x4000
!endif

Var InstallerDisplayBrand
Var InstallerComposedTitle

Function InstallerComposeTitle
    ${If} "$(INSTALLER_TITLE_STYLE)" == "compact"
        StrCpy $InstallerComposedTitle "$(INSTALLER_TITLE)$InstallerDisplayBrand"
    ${Else}
        StrCpy $InstallerComposedTitle "$(INSTALLER_TITLE) $InstallerDisplayBrand"
    ${EndIf}
FunctionEnd

Var InstallerDialog
Var InstallerPhase
Var InstallerDpi
Var InstallerButton
Var InstallerStatus
Var InstallerFont
Var InstallerSmallFont
Var InstallerLabelFont
Var InstallerTitleFont
Var InstallerHeadingFont
Var InstallerStrongFont
Var InstallerStepFont
Var InstallerEdit
Var InstallerEditFrame
Var InstallerBrowse
Var InstallerLaunch
Var InstallerLaunchHint
Var InstallerCancel
Var InstallerMinimizeButton
Var InstallerCloseButton
Var InstallerDragSurface
Var InstallerBackdrop
Var InstallerBackdropBitmap
Var InstallerBackdropOld
Var InstallerPageTitle
Var InstallerPageSubtitle
Var InstallerStep1
Var InstallerStep2
Var InstallerStep3
Var InstallerStep4
Var InstallerKicker
Var InstallerHeading
Var InstallerDescription
Var InstallerSuccessHeading
Var InstallerSuccessDescription
Var InstallerLocationLabel
Var InstallerFact1Label
Var InstallerFact1Value
Var InstallerFact2Label
Var InstallerFact2Value
Var InstallerFootnote
Var InstallerLayoutPtr
Var InstallerWindowWidthPx
Var InstallerWindowHeightPx
Var InstallerLayoutWidth
Var InstallerLayoutHeight
Var InstallerDesktop
Var InstallerCardX
Var InstallerCardY
Var InstallerCardW
Var InstallerCardH
Var InstallerRailW
Var InstallerContentX
Var InstallerContentY
Var InstallerContentW
Var InstallerPageTitleX
Var InstallerPageTitleY
Var InstallerPageTitleW
Var InstallerPageTitleH
Var InstallerPageSubtitleY
Var InstallerStepX
Var InstallerStepY
Var InstallerStepGap
Var InstallerStepSize
Var InstallerStepLabelX
Var InstallerStepLabelY
Var InstallerStepLabelW
Var InstallerStepLastW
Var InstallerKickerY
Var InstallerHeadingY
Var InstallerDescY
Var InstallerLabelX
Var InstallerLabelY
Var InstallerLabelW
Var InstallerTrackY
Var InstallerLogY1
Var InstallerLogY2
Var InstallerFootnoteX
Var InstallerFootnoteY
Var InstallerFootnoteW
Var InstallerFootnoteH
Var InstallerFieldX
Var InstallerFieldY
Var InstallerFieldW
Var InstallerFieldH
Var InstallerBrowseX
Var InstallerBrowseW
Var InstallerActionY
Var InstallerActionH
Var InstallerFactY
Var InstallerFact2X
Var InstallerFactW
Var InstallerButtonX
Var InstallerCancelX
!include "${__FILEDIR__}\path.nsh"
!include "${__FILEDIR__}\drawing.nsh"

; All layout values are 96-DPI logical pixels.
!macro InstallerPlace HWND X Y W H
    System::Call 'kernel32::MulDiv(i ${X}, i $InstallerDpi, i 96) i.r0'
    System::Call 'kernel32::MulDiv(i ${Y}, i $InstallerDpi, i 96) i.r1'
    System::Call 'kernel32::MulDiv(i ${W}, i $InstallerDpi, i 96) i.r2'
    System::Call 'kernel32::MulDiv(i ${H}, i $InstallerDpi, i 96) i.r3'
    System::Call 'user32::MoveWindow(p ${HWND}, i r0, i r1, i r2, i r3, i 1)'
!macroend

!macro InstallerLabel VAR X Y W H FONT TEXT
    ${NSD_CreateLabel} 0 0 0 0 "${TEXT}"
    Pop ${VAR}
    !insertmacro InstallerPlace ${VAR} ${X} ${Y} ${W} ${H}
    SendMessage ${VAR} ${WM_SETFONT} ${FONT} 1
!macroend

; C ABI layout field offsets (LONG/UINT fields are 4 bytes).
!define LAYOUT_DESKTOP 8
!define LAYOUT_WIDTH 12
!define LAYOUT_HEIGHT 16
!define LAYOUT_CARD_X 20
!define LAYOUT_CARD_Y 24
!define LAYOUT_CARD_W 28
!define LAYOUT_CARD_H 32
!define LAYOUT_RAIL_W 48
!define LAYOUT_CONTENT_X 56
!define LAYOUT_CONTENT_Y 60
!define LAYOUT_CONTENT_W 64
!define LAYOUT_TITLE_X 68
!define LAYOUT_TITLE_Y 72
!define LAYOUT_TITLE_W 76
!define LAYOUT_TITLE_H 80
!define LAYOUT_SUBTITLE_Y 84
!define LAYOUT_STEP_X 88
!define LAYOUT_STEP_Y 92
!define LAYOUT_STEP_GAP 96
!define LAYOUT_STEP_SIZE 100
!define LAYOUT_STEP_LABEL_X 104
!define LAYOUT_STEP_LABEL_Y 108
!define LAYOUT_STEP_LABEL_W 112
!define LAYOUT_STEP_LAST_W 116
!define LAYOUT_KICKER_Y 120
!define LAYOUT_HEADING_Y 124
!define LAYOUT_DESC_Y 128
!define LAYOUT_LABEL_X 144
!define LAYOUT_LABEL_Y 148
!define LAYOUT_LABEL_W 152
!define LAYOUT_TRACK_Y 156
!define LAYOUT_LOG_Y1 164
!define LAYOUT_LOG_Y2 168
!define LAYOUT_FOOTNOTE_X 172
!define LAYOUT_FOOTNOTE_Y 176
!define LAYOUT_FOOTNOTE_W 180
!define LAYOUT_FOOTNOTE_H 184

!macro InstallerReadMetric PTR OFFSET OUT
    StrCpy $R8 ${PTR}
    IntOp $R8 $R8 + ${OFFSET}
    System::Call '*$R8(i .R9)'
    StrCpy ${OUT} $R9
!macroend

Function InstallerQueryMetrics
    System::Alloc 256
    Pop $InstallerLayoutPtr
    StrCpy $0 $InstallerLayoutPtr
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerQueryLayout(i $InstallerWindowWidthPx, i $InstallerWindowHeightPx, i $InstallerDpi, p r0) i.r1'
    ${If} $1 == 0
        System::Free $InstallerLayoutPtr
        StrCpy $InstallerLayoutPtr 0
        MessageBox MB_OK|MB_ICONSTOP "$(INSTALLER_UI_ERROR)"
        SetErrorLevel 2
        Quit
    ${EndIf}
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_DESKTOP} $InstallerDesktop
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_WIDTH} $InstallerLayoutWidth
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_HEIGHT} $InstallerLayoutHeight
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_CARD_X} $InstallerCardX
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_CARD_Y} $InstallerCardY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_CARD_W} $InstallerCardW
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_CARD_H} $InstallerCardH
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_RAIL_W} $InstallerRailW
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_CONTENT_X} $InstallerContentX
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_CONTENT_Y} $InstallerContentY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_CONTENT_W} $InstallerContentW
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_TITLE_X} $InstallerPageTitleX
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_TITLE_Y} $InstallerPageTitleY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_TITLE_W} $InstallerPageTitleW
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_TITLE_H} $InstallerPageTitleH
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_SUBTITLE_Y} $InstallerPageSubtitleY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_STEP_X} $InstallerStepX
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_STEP_Y} $InstallerStepY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_STEP_GAP} $InstallerStepGap
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_STEP_SIZE} $InstallerStepSize
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_STEP_LABEL_X} $InstallerStepLabelX
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_STEP_LABEL_Y} $InstallerStepLabelY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_STEP_LABEL_W} $InstallerStepLabelW
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_STEP_LAST_W} $InstallerStepLastW
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_KICKER_Y} $InstallerKickerY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_HEADING_Y} $InstallerHeadingY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_DESC_Y} $InstallerDescY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_LABEL_X} $InstallerLabelX
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_LABEL_Y} $InstallerLabelY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_LABEL_W} $InstallerLabelW
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_TRACK_Y} $InstallerTrackY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_LOG_Y1} $InstallerLogY1
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_LOG_Y2} $InstallerLogY2
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_FOOTNOTE_X} $InstallerFootnoteX
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_FOOTNOTE_Y} $InstallerFootnoteY
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_FOOTNOTE_W} $InstallerFootnoteW
    !insertmacro InstallerReadMetric $InstallerLayoutPtr ${LAYOUT_FOOTNOTE_H} $InstallerFootnoteH
    System::Free $InstallerLayoutPtr
    StrCpy $InstallerLayoutPtr 0
    StrCpy $InstallerFieldX $InstallerLabelX
    StrCpy $InstallerFieldW $InstallerLabelW
    IntOp $InstallerFieldW $InstallerFieldW - 112
    StrCpy $InstallerBrowseX $InstallerFieldX
    IntOp $InstallerBrowseX $InstallerBrowseX + $InstallerFieldW
    IntOp $InstallerBrowseX $InstallerBrowseX + 8
    StrCpy $InstallerBrowseW 104
    StrCpy $InstallerFieldH 44
    StrCpy $InstallerActionH 42
    ${If} $InstallerDesktop == 1
        StrCpy $InstallerFieldY 408
        StrCpy $InstallerActionY 690
        StrCpy $InstallerFactY 570
    ${Else}
        StrCpy $InstallerFieldY 418
        StrCpy $InstallerActionY 730
        StrCpy $InstallerFactY 580
    ${EndIf}
    StrCpy $InstallerButtonX $InstallerLabelX
    IntOp $InstallerButtonX $InstallerButtonX + $InstallerLabelW
    IntOp $InstallerButtonX $InstallerButtonX - 160
    StrCpy $InstallerCancelX $InstallerLabelX
    StrCpy $InstallerFactW $InstallerLabelW
    IntOp $InstallerFactW $InstallerFactW - 24
    IntOp $InstallerFactW $InstallerFactW / 2
    StrCpy $InstallerFact2X $InstallerLabelX
    IntOp $InstallerFact2X $InstallerFact2X + $InstallerFactW
    IntOp $InstallerFact2X $InstallerFact2X + 24
FunctionEnd

Function InstallerMoveLogical
    System::Call 'kernel32::MulDiv(i R1, i $InstallerDpi, i 96) i.R5'
    System::Call 'kernel32::MulDiv(i R2, i $InstallerDpi, i 96) i.R6'
    System::Call 'kernel32::MulDiv(i R3, i $InstallerDpi, i 96) i.R7'
    System::Call 'kernel32::MulDiv(i R4, i $InstallerDpi, i 96) i.R8'
    System::Call 'user32::MoveWindow(p R0, i R5, i R6, i R7, i R8, i 1)'
FunctionEnd

!macro InstallerMove HWND X Y W H
    StrCpy $R0 ${HWND}
    StrCpy $R1 ${X}
    StrCpy $R2 ${Y}
    StrCpy $R3 ${W}
    StrCpy $R4 ${H}
    Call InstallerMoveLogical
!macroend

; Rebuilds the static card when the wizard advances a step; the old image stays until replaced.
Function InstallerRefreshBackdrop
    StrCpy $InstallerBackdropOld 0
    ${If} $InstallerBackdropBitmap != 0
        StrCpy $InstallerBackdropOld $InstallerBackdropBitmap
        StrCpy $InstallerBackdropBitmap 0
    ${EndIf}
    StrCpy $0 $InstallerWindowWidthPx
    StrCpy $1 $InstallerWindowHeightPx
    StrCpy $2 0
    ${If} $InstallerPhase == "platform"
        StrCpy $2 4
    ${ElseIf} $InstallerPhase == "success"
        StrCpy $2 1
    ${EndIf}
    StrCpy $4 "$PLUGINSDIR\brand-2x.bmp"
    !ifdef DSH_SUIYI
        StrCpy $4 "$PLUGINSDIR\mark-2x.png"
    !endif
    ${If} $InstallerDark == 1
        StrCpy $4 "$PLUGINSDIR\brand-dark-2x.bmp"
        !ifdef DSH_SUIYI
            StrCpy $4 "$PLUGINSDIR\mark-dark-2x.png"
        !endif
    ${EndIf}
    StrCpy $5 "$(INSTALLER_STEP_PREPARE_DESC)$\r$\n$(INSTALLER_STEP_SETUP_DESC)$\r$\n$(INSTALLER_STEP_INSTALL_DESC)$\r$\n$(INSTALLER_STEP_FINISH_DESC)$\r$\n$InstallerDisplayBrand$\r$\n$(INSTALLER_PROGRESS_NOTE)"
    System::Call '$PLUGINSDIR\window-frame.dll::InstallerCreateBackdrop(i r0, i r1, i $InstallerDpi, i $InstallerDark, i r2, w r4, w r5) p.r3 ?c'
    StrCpy $InstallerBackdropBitmap $3
    ${If} $InstallerBackdropBitmap == 0
        MessageBox MB_OK|MB_ICONSTOP "$(INSTALLER_UI_ERROR)"
        SetErrorLevel 2
        Quit
    ${EndIf}
    SendMessage $InstallerBackdrop ${STM_SETIMAGE} ${IMAGE_BITMAP} $InstallerBackdropBitmap
    ${If} $InstallerBackdropOld != 0
        System::Call 'gdi32::DeleteObject(p $InstallerBackdropOld)'
    ${EndIf}
FunctionEnd

; The current step owns primary ink; completed and pending steps stay muted.
Function InstallerStyleSteps
    ${If} $InstallerPhase == "platform"
        !insertmacro InstallerCardColors $InstallerStep1
        !insertmacro InstallerCardMutedColors $InstallerStep2
        !insertmacro InstallerCardMutedColors $InstallerStep3
        !insertmacro InstallerCardMutedColors $InstallerStep4
    ${ElseIf} $InstallerPhase == "success"
        !insertmacro InstallerCardMutedColors $InstallerStep1
        !insertmacro InstallerCardMutedColors $InstallerStep2
        !insertmacro InstallerCardMutedColors $InstallerStep3
        !insertmacro InstallerCardColors $InstallerStep4
    ${Else}
        !insertmacro InstallerCardMutedColors $InstallerStep1
        !insertmacro InstallerCardColors $InstallerStep2
        !insertmacro InstallerCardMutedColors $InstallerStep3
        !insertmacro InstallerCardMutedColors $InstallerStep4
    ${EndIf}
FunctionEnd

; Step 1 recognizes the running platform without offering fake cross-platform choices.
Function InstallerPlatformContinue
    ${If} $InstallerPhase != "platform"
        Return
    ${EndIf}
    StrCpy $InstallerPhase "welcome"
    Call InstallerRefreshBackdrop
    Call InstallerStyleSteps
    Call InstallerRender
    ${NSD_CreateTimer} InstallerTrackFieldFocus 200
    System::Call 'user32::SetFocus(p $InstallerEdit)'
FunctionEnd

Function InstallerCreate
    nsDialogs::Create 1018
    Pop $InstallerDialog
    ${If} $InstallerDialog == error
        Abort
    ${EndIf}
    !insertmacro InstallerPlace $InstallerDialog 0 0 ${INSTALLER_WINDOW_WIDTH} ${INSTALLER_WINDOW_HEIGHT}
    !insertmacro InstallerPageColors $HWNDPARENT
    !insertmacro InstallerPageColors $InstallerDialog
    !insertmacro InstallerPixelFont $InstallerFont ${INSTALLER_BUTTON_FONT_SIZE} 500
    !insertmacro InstallerPixelFont $InstallerSmallFont ${INSTALLER_BODY_FONT_SIZE} 400
    !insertmacro InstallerPixelFont $InstallerLabelFont ${INSTALLER_LABEL_FONT_SIZE} 400
    !insertmacro InstallerPixelFont $InstallerTitleFont ${INSTALLER_TITLE_FONT_SIZE} 400
    !insertmacro InstallerPixelFont $InstallerHeadingFont ${INSTALLER_HEADING_FONT_SIZE} 500
    !insertmacro InstallerPixelFont $InstallerStrongFont ${INSTALLER_BODY_FONT_SIZE} 500
    !insertmacro InstallerPixelFont $InstallerStepFont ${INSTALLER_STEP_FONT_SIZE} 500
    System::Call '*(i 1, p 0, i 0, i 0) p.r0'
    System::Call 'gdiplus::GdiplusStartup(*p .r1, p r0, p 0) i.r2'
    StrCpy $InstallerGdiToken $1
    System::Free $0
    ${If} $2 != 0
        MessageBox MB_OK|MB_ICONSTOP "$(INSTALLER_UI_ERROR)"
        SetErrorLevel 2
        Quit
    ${EndIf}
    StrCpy $InstallerFieldInvalid 0
    StrCpy $InstallerFieldFocused 0
    StrCpy $InstallerEditFrameBitmap 0
    StrCpy $InstallerBackdropBitmap 0
    StrCpy $InstallerBackdropOld 0

    ; New child windows start below existing siblings; lower decorative layers after creation.
    ${NSD_CreateBitmap} 0 0 0 0 ""
    Pop $InstallerBackdrop
    !insertmacro InstallerPlace $InstallerBackdrop 0 0 ${INSTALLER_WINDOW_WIDTH} ${INSTALLER_WINDOW_HEIGHT}
    Call InstallerRefreshBackdrop

    ; Custom caption: a drag surface plus minimize and close controls.
    ${NSD_CreateLabel} 0 0 0 0 ""
    Pop $InstallerDragSurface
    !insertmacro InstallerPlace $InstallerDragSurface 0 0 504 48
    ${NSD_AddStyle} $InstallerDragSurface ${SS_NOTIFY}
    ${NSD_OnClick} $InstallerDragSurface InstallerDrag
    !insertmacro InstallerPageTransparentColors $InstallerDragSurface
    ${NSD_CreateButton} 0 0 0 0 "−"
    Pop $InstallerMinimizeButton
    !insertmacro InstallerPlace $InstallerMinimizeButton ${INSTALLER_CAPTION_MIN_X} ${INSTALLER_CAPTION_Y} ${INSTALLER_CAPTION_W} ${INSTALLER_CAPTION_H}
    ${NSD_OnClick} $InstallerMinimizeButton InstallerMinimize
    ${NSD_OnNotify} $InstallerMinimizeButton InstallerPaintButton
    !insertmacro InstallerCaptionColors $InstallerMinimizeButton
    ${NSD_CreateButton} 0 0 0 0 "×"
    Pop $InstallerCloseButton
    !insertmacro InstallerPlace $InstallerCloseButton ${INSTALLER_CAPTION_CLOSE_X} ${INSTALLER_CAPTION_Y} ${INSTALLER_CAPTION_W} ${INSTALLER_CAPTION_H}
    ${NSD_OnClick} $InstallerCloseButton InstallerClose
    ${NSD_OnNotify} $InstallerCloseButton InstallerPaintButton
    !insertmacro InstallerCaptionColors $InstallerCloseButton

    !insertmacro InstallerLabel $InstallerPageTitle 16 86 568 40 $InstallerTitleFont ""
    !insertmacro InstallerPageTransparentColors $InstallerPageTitle
    Call InstallerComposeTitle
    StrCpy $0 "$InstallerComposedTitle"
    ${NSD_SetText} $InstallerPageTitle "$0"
    !insertmacro InstallerLabel $InstallerPageSubtitle 16 126 568 30 $InstallerSmallFont "$(INSTALLER_PAGE_SUBTITLE)"
    !insertmacro InstallerPageTransparentMutedColors $InstallerPageSubtitle

    !insertmacro InstallerLabel $InstallerStep1 62 239 84 16 $InstallerStepFont "$(INSTALLER_STEP_PREPARE)"
    !insertmacro InstallerLabel $InstallerStep2 224 239 84 16 $InstallerStepFont "$(INSTALLER_STEP_SETUP)"
    !insertmacro InstallerLabel $InstallerStep3 386 239 84 16 $InstallerStepFont "$(INSTALLER_STEP_INSTALL)"
    !insertmacro InstallerLabel $InstallerStep4 548 239 36 16 $InstallerStepFont "$(INSTALLER_STEP_FINISH)"
    Call InstallerStyleSteps

    !insertmacro InstallerLabel $InstallerKicker 37 300 526 16 $InstallerStepFont ""
    !insertmacro InstallerCardAccentColors $InstallerKicker
    !insertmacro InstallerLabel $InstallerHeading 37 326 526 39 $InstallerHeadingFont ""
    !insertmacro InstallerCardColors $InstallerHeading
    !insertmacro InstallerLabel $InstallerDescription 37 376 526 22 $InstallerSmallFont ""
    !insertmacro InstallerCardMutedColors $InstallerDescription
    !insertmacro InstallerLabel $InstallerSuccessHeading 37 370 526 40 $InstallerHeadingFont ""
    !insertmacro InstallerCardColors $InstallerSuccessHeading
    ${NSD_AddStyle} $InstallerSuccessHeading ${SS_CENTER}
    ShowWindow $InstallerSuccessHeading 0
    !insertmacro InstallerLabel $InstallerSuccessDescription 37 414 526 40 $InstallerSmallFont ""
    !insertmacro InstallerCardMutedColors $InstallerSuccessDescription
    ${NSD_AddStyle} $InstallerSuccessDescription ${SS_CENTER}
    ShowWindow $InstallerSuccessDescription 0
    !insertmacro InstallerLabel $InstallerLocationLabel 37 400 526 16 $InstallerLabelFont "$(INSTALLER_LOCATION_LABEL)"
    !insertmacro InstallerCardMutedColors $InstallerLocationLabel

    ${NSD_CreateBitmap} 0 0 0 0 ""
    Pop $InstallerEditFrame
    !insertmacro InstallerMove $InstallerEditFrame $InstallerFieldX $InstallerFieldY $InstallerFieldW $InstallerFieldH
    Call InstallerDrawEditFrame
    ${NSD_CreateText} 0 0 0 0 "$InstallerPath"
    Pop $InstallerEdit
    System::Call 'user32::GetWindowLongW(p $InstallerEdit, i -16) i.r0'
    IntOp $0 $0 & 0xFF7FFFFF
    System::Call 'user32::SetWindowLongW(p $InstallerEdit, i -16, i r0)'
    System::Call 'user32::GetWindowLongW(p $InstallerEdit, i -20) i.r0'
    IntOp $0 $0 & 0xFFFFFDFF
    System::Call 'user32::SetWindowLongW(p $InstallerEdit, i -20, i r0)'
    SendMessage $InstallerEdit ${WM_SETFONT} $InstallerSmallFont 1
    !insertmacro InstallerFieldColors $InstallerEdit
    ; A borderless single-line edit sits inside a separate padded frame.
    System::Call 'user32::GetDC(p $InstallerEdit) p.r4'
    System::Call 'gdi32::SelectObject(p r4, p $InstallerSmallFont) p.r5'
    System::Alloc 60
    Pop $6
    System::Call 'gdi32::GetTextMetricsW(p r4, p r6)'
    System::Call '*$6(i .r7)'
    System::Free $6
    System::Call 'gdi32::SelectObject(p r4, p r5)'
    System::Call 'user32::ReleaseDC(p $InstallerEdit, p r4)'
    System::Call 'kernel32::MulDiv(i $InstallerFieldX, i $InstallerDpi, i 96) i.r0'
    System::Call 'kernel32::MulDiv(i $InstallerFieldY, i $InstallerDpi, i 96) i.r1'
    System::Call 'kernel32::MulDiv(i $InstallerFieldW, i $InstallerDpi, i 96) i.r2'
    System::Call 'kernel32::MulDiv(i $InstallerFieldH, i $InstallerDpi, i 96) i.r3'
    System::Call 'kernel32::MulDiv(i 14, i $InstallerDpi, i 96) i.r8'
    IntOp $0 $0 + $8
    IntOp $3 $3 - $7
    IntOp $3 $3 / 2
    IntOp $1 $1 + $3
    IntOp $2 $2 - $8
    IntOp $2 $2 - $8
    System::Call 'user32::MoveWindow(p $InstallerEdit, i r0, i r1, i r2, i r7, i 1)'
    System::Call 'user32::SetWindowPos(p $InstallerEdit, p 0, i 0, i 0, i 0, i 0, i 0x33)'
    SendMessage $InstallerEdit ${EM_SETLIMITTEXT} 180 0
    ${NSD_OnChange} $InstallerEdit InstallerPathChanged

    ${NSD_CreateButton} 0 0 0 0 "$(INSTALLER_BROWSE)"
    Pop $InstallerBrowse
    !insertmacro InstallerPlace $InstallerBrowse ${INSTALLER_BROWSE_X} ${INSTALLER_BROWSE_Y} ${INSTALLER_BROWSE_W} ${INSTALLER_BROWSE_H}
    ${NSD_OnClick} $InstallerBrowse InstallerBrowsePath
    ${NSD_OnNotify} $InstallerBrowse InstallerPaintButton

    !insertmacro InstallerLabel $InstallerStatus 37 466 526 40 $InstallerLabelFont ""
    !insertmacro InstallerErrorColors $InstallerStatus
    ShowWindow $InstallerStatus 0

    ${NSD_CreateCheckbox} 0 0 0 0 "$(INSTALLER_LAUNCH)"
    Pop $InstallerLaunch
    !insertmacro InstallerPlace $InstallerLaunch 37 512 526 22
    SendMessage $InstallerLaunch ${WM_SETFONT} $InstallerSmallFont 1
    !insertmacro InstallerCardColors $InstallerLaunch
    ${NSD_OnNotify} $InstallerLaunch InstallerPaintCheckbox
    ${NSD_Check} $InstallerLaunch
    !insertmacro InstallerLabel $InstallerLaunchHint 51 534 512 16 $InstallerLabelFont "$(INSTALLER_LAUNCH_HINT)"
    !insertmacro InstallerCardMutedColors $InstallerLaunchHint

    !insertmacro InstallerLabel $InstallerFact1Label 37 580 250 14 $InstallerLabelFont ""
    !insertmacro InstallerCardMutedColors $InstallerFact1Label
    !insertmacro InstallerLabel $InstallerFact1Value 37 596 250 18 $InstallerStrongFont ""
    !insertmacro InstallerCardColors $InstallerFact1Value
    ${NSD_AddStyle} $InstallerFact1Value ${SS_ENDELLIPSIS}
    !insertmacro InstallerLabel $InstallerFact2Label 311 580 252 14 $InstallerLabelFont ""
    !insertmacro InstallerCardMutedColors $InstallerFact2Label
    !insertmacro InstallerLabel $InstallerFact2Value 311 596 252 18 $InstallerStrongFont ""
    !insertmacro InstallerCardColors $InstallerFact2Value
    ${NSD_AddStyle} $InstallerFact2Value ${SS_ENDELLIPSIS}

    ${NSD_CreateButton} 0 0 0 0 "$(INSTALLER_CANCEL)"
    Pop $InstallerCancel
    !insertmacro InstallerPlace $InstallerCancel ${INSTALLER_CANCEL_X} ${INSTALLER_ACTION_Y} ${INSTALLER_CANCEL_W} ${INSTALLER_ACTION_H}
    ${NSD_OnClick} $InstallerCancel InstallerCancel
    ${NSD_OnNotify} $InstallerCancel InstallerPaintButton

    ${NSD_CreateButton} 0 0 0 0 "$(INSTALLER_INSTALL)"
    Pop $InstallerButton
    !insertmacro InstallerPlace $InstallerButton ${INSTALLER_INSTALL_X} ${INSTALLER_ACTION_Y} ${INSTALLER_INSTALL_W} ${INSTALLER_ACTION_H}
    SendMessage $InstallerButton ${WM_SETFONT} $InstallerFont 1
    ${NSD_OnClick} $InstallerButton InstallerStart
    ${NSD_OnNotify} $InstallerButton InstallerPaintButton

    !insertmacro InstallerLabel $InstallerFootnote 16 808 568 17 $InstallerLabelFont ""
    !insertmacro InstallerPageTransparentMutedColors $InstallerFootnote

    Call InstallerRender
    ; HWND_BOTTOM keeps decorative bitmaps behind native controls and their hit targets.
    System::Call 'user32::SetWindowPos(p $InstallerEditFrame, p 1, i 0, i 0, i 0, i 0, i 0x13) i.r0'
    ${If} $0 == 0
        MessageBox MB_OK|MB_ICONSTOP "$(INSTALLER_UI_ERROR)"
        SetErrorLevel 2
        Quit
    ${EndIf}
    System::Call 'user32::SetWindowPos(p $InstallerBackdrop, p 1, i 0, i 0, i 0, i 0, i 0x13) i.r0'
    ${If} $0 == 0
        MessageBox MB_OK|MB_ICONSTOP "$(INSTALLER_UI_ERROR)"
        SetErrorLevel 2
        Quit
    ${EndIf}
    System::Call 'user32::SetPropW(p $HWNDPARENT, w "HarnessInstaller.Ready", p 1)'
    ShowWindow $InstallerDialog 5
    ShowWindow $HWNDPARENT 5
    ${If} $InstallerPhase == "platform"
        System::Call '$PLUGINSDIR\window-frame.dll::InstallerPresentWelcome(p $HWNDPARENT) i.r0 ?c'
    ${EndIf}
    nsDialogs::Show
    ${NSD_KillTimer} InstallerValidateEditedPath
    ${NSD_KillTimer} InstallerTrackFieldFocus
    ${If} $InstallerEditFrameBitmap != 0
        System::Call 'gdi32::DeleteObject(p $InstallerEditFrameBitmap)'
    ${EndIf}
    ${If} $InstallerBackdropBitmap != 0
        System::Call 'gdi32::DeleteObject(p $InstallerBackdropBitmap)'
    ${EndIf}
    System::Call 'gdiplus::GdiplusShutdown(p $InstallerGdiToken)'
    System::Call 'gdi32::DeleteObject(p $InstallerFont)'
    System::Call 'gdi32::DeleteObject(p $InstallerSmallFont)'
    System::Call 'gdi32::DeleteObject(p $InstallerLabelFont)'
    System::Call 'gdi32::DeleteObject(p $InstallerTitleFont)'
    System::Call 'gdi32::DeleteObject(p $InstallerHeadingFont)'
    System::Call 'gdi32::DeleteObject(p $InstallerStrongFont)'
    System::Call 'gdi32::DeleteObject(p $InstallerStepFont)'
    ; Release the private faces only after every page-owned font handle is gone.
    ${If} $InstallerPhase == "success"
        Call InstallerUnloadFonts
    ${EndIf}
FunctionEnd

Function InstallerApplyLayout
    !insertmacro InstallerMove $InstallerDialog 0 0 $InstallerLayoutWidth $InstallerLayoutHeight
    !insertmacro InstallerMove $InstallerBackdrop 0 0 $InstallerLayoutWidth $InstallerLayoutHeight
    StrCpy $1 $InstallerLayoutWidth
    IntOp $1 $1 - 96
    !insertmacro InstallerMove $InstallerDragSurface 0 0 $1 48
    StrCpy $1 $InstallerLayoutWidth
    IntOp $1 $1 - 96
    !insertmacro InstallerMove $InstallerMinimizeButton $1 8 40 32
    StrCpy $1 $InstallerLayoutWidth
    IntOp $1 $1 - 52
    !insertmacro InstallerMove $InstallerCloseButton $1 8 40 32
    !insertmacro InstallerMove $InstallerPageTitle $InstallerPageTitleX $InstallerPageTitleY $InstallerPageTitleW $InstallerPageTitleH
    !insertmacro InstallerMove $InstallerPageSubtitle $InstallerPageTitleX $InstallerPageSubtitleY $InstallerPageTitleW 30
    StrCpy $0 $InstallerStepLabelX
    StrCpy $1 $InstallerStepLabelY
    StrCpy $2 $InstallerStepLabelW
    !insertmacro InstallerMove $InstallerStep1 $0 $1 $2 16
    ${If} $InstallerDesktop == 1
        IntOp $1 $1 + $InstallerStepGap
        !insertmacro InstallerMove $InstallerStep2 $0 $1 $2 16
        IntOp $1 $1 + $InstallerStepGap
        !insertmacro InstallerMove $InstallerStep3 $0 $1 $2 16
        IntOp $1 $1 + $InstallerStepGap
        StrCpy $2 $InstallerStepLastW
        !insertmacro InstallerMove $InstallerStep4 $0 $1 $2 16
    ${Else}
        IntOp $0 $0 + $InstallerStepGap
        !insertmacro InstallerMove $InstallerStep2 $0 $1 $2 16
        IntOp $0 $0 + $InstallerStepGap
        !insertmacro InstallerMove $InstallerStep3 $0 $1 $2 16
        IntOp $0 $0 + $InstallerStepGap
        StrCpy $2 $InstallerStepLastW
        !insertmacro InstallerMove $InstallerStep4 $0 $1 $2 16
    ${EndIf}
    !insertmacro InstallerMove $InstallerKicker $InstallerLabelX $InstallerKickerY $InstallerLabelW 16
    !insertmacro InstallerMove $InstallerHeading $InstallerLabelX $InstallerHeadingY $InstallerLabelW 39
    !insertmacro InstallerMove $InstallerDescription $InstallerLabelX $InstallerDescY $InstallerLabelW 22
    !insertmacro InstallerMove $InstallerSuccessHeading $InstallerLabelX 370 $InstallerLabelW 40
    !insertmacro InstallerMove $InstallerSuccessDescription $InstallerLabelX 414 $InstallerLabelW 40
    StrCpy $3 $InstallerFieldY
    IntOp $3 $3 - 18
    !insertmacro InstallerMove $InstallerLocationLabel $InstallerLabelX $3 $InstallerLabelW 16
    !insertmacro InstallerMove $InstallerEditFrame $InstallerFieldX $InstallerFieldY $InstallerFieldW $InstallerFieldH
    Call InstallerDrawEditFrame
    StrCpy $3 $InstallerFieldX
    IntOp $3 $3 + 14
    StrCpy $5 $InstallerFieldY
    IntOp $5 $5 + 10
    StrCpy $6 $InstallerFieldW
    IntOp $6 $6 - 28
    !insertmacro InstallerMove $InstallerEdit $3 $5 $6 24
    !insertmacro InstallerMove $InstallerBrowse $InstallerBrowseX $InstallerFieldY $InstallerBrowseW $InstallerFieldH
    StrCpy $3 $InstallerFieldY
    IntOp $3 $3 + 48
    !insertmacro InstallerMove $InstallerStatus $InstallerLabelX $3 $InstallerLabelW 40
    ${If} $InstallerPhase == "success"
        StrCpy $3 560
    ${Else}
        StrCpy $3 $InstallerFieldY
        IntOp $3 $3 + 94
    ${EndIf}
    !insertmacro InstallerMove $InstallerLaunch $InstallerLabelX $3 $InstallerLabelW 22
    IntOp $3 $3 + 22
    !insertmacro InstallerMove $InstallerLaunchHint $InstallerLabelX $3 $InstallerLabelW 16
    ${If} $InstallerPhase == "success"
        StrCpy $3 500
    ${ElseIf} $InstallerPhase == "platform"
        StrCpy $3 440
    ${Else}
        StrCpy $3 $InstallerFactY
    ${EndIf}
    !insertmacro InstallerMove $InstallerFact1Label $InstallerLabelX $3 $InstallerFactW 14
    StrCpy $5 $3
    IntOp $5 $5 + 16
    !insertmacro InstallerMove $InstallerFact1Value $InstallerLabelX $5 $InstallerFactW 18
    !insertmacro InstallerMove $InstallerFact2Label $InstallerFact2X $3 $InstallerFactW 14
    !insertmacro InstallerMove $InstallerFact2Value $InstallerFact2X $5 $InstallerFactW 18
    ${If} $InstallerPhase == "success"
        StrCpy $0 $InstallerLabelW
        IntOp $0 $0 - 240
        IntOp $0 $0 / 2
        IntOp $0 $0 + $InstallerLabelX
        !insertmacro InstallerMove $InstallerButton $0 $InstallerActionY 240 $InstallerActionH
    ${Else}
        !insertmacro InstallerMove $InstallerButton $InstallerButtonX $InstallerActionY 160 $InstallerActionH
    ${EndIf}
    !insertmacro InstallerMove $InstallerCancel $InstallerCancelX $InstallerActionY 96 $InstallerActionH
    !insertmacro InstallerMove $InstallerFootnote $InstallerFootnoteX $InstallerFootnoteY $InstallerFootnoteW $InstallerFootnoteH
FunctionEnd

Function InstallerRender
    ShowWindow $InstallerStatus 0
    ShowWindow $InstallerKicker 5
    ShowWindow $InstallerHeading 5
    ShowWindow $InstallerDescription 5
    ShowWindow $InstallerSuccessHeading 0
    ShowWindow $InstallerSuccessDescription 0
    ShowWindow $InstallerFact1Label 5
    ShowWindow $InstallerFact1Value 5
    ShowWindow $InstallerFact2Label 5
    ShowWindow $InstallerFact2Value 5
    ShowWindow $InstallerLaunch 5
    ShowWindow $InstallerLaunchHint 5
    ShowWindow $InstallerFootnote 5
    ShowWindow $InstallerButton 5
    ${If} $InstallerPhase == "success"
        ; Centered completion state beneath the success tile.
        ShowWindow $InstallerHeading 0
        ShowWindow $InstallerDescription 0
        ShowWindow $InstallerSuccessHeading 5
        ShowWindow $InstallerSuccessDescription 5
        !insertmacro InstallerPlace $InstallerFact1Label 37 500 250 14
        !insertmacro InstallerPlace $InstallerFact1Value 37 516 250 18
        !insertmacro InstallerPlace $InstallerFact2Label 311 500 252 14
        !insertmacro InstallerPlace $InstallerFact2Value 311 516 252 18
        !insertmacro InstallerPlace $InstallerLaunch 37 560 526 22
        !insertmacro InstallerPlace $InstallerLaunchHint 51 582 512 16
        !insertmacro InstallerPlace $InstallerButton 180 730 240 42
        !insertmacro InstallerPlace $InstallerFootnote 16 808 568 17
        ShowWindow $InstallerKicker 0
        ${NSD_SetText} $InstallerKicker ""
        ${NSD_SetText} $InstallerSuccessHeading "$(INSTALLER_FINISH_HEADING)"
        ${NSD_SetText} $InstallerSuccessDescription "$(INSTALLER_FINISH_DESC)"
        ${NSD_SetText} $InstallerFact1Label "$(INSTALLER_LOCATION_LABEL)"
        ${NSD_SetText} $InstallerFact1Value "$INSTDIR"
        ${NSD_SetText} $InstallerFact2Label "$(INSTALLER_VERSION_LABEL)"
        ${NSD_SetText} $InstallerFact2Value "${VERSION}"
        ${NSD_SetText} $InstallerFootnote "$(INSTALLER_FINISH_NOTE)"
        ${NSD_SetText} $InstallerButton "$(INSTALLER_FINISH)"
        ShowWindow $InstallerLocationLabel 0
        ShowWindow $InstallerEditFrame 0
        ShowWindow $InstallerEdit 0
        ShowWindow $InstallerBrowse 0
        ShowWindow $InstallerCancel 0
    ${ElseIf} $InstallerPhase == "platform"
        !insertmacro InstallerPlace $InstallerHeading 37 326 526 39
        !insertmacro InstallerPlace $InstallerDescription 37 376 526 22
        !insertmacro InstallerPlace $InstallerFact1Label 37 440 250 14
        !insertmacro InstallerPlace $InstallerFact1Value 37 456 250 18
        !insertmacro InstallerPlace $InstallerFact2Label 311 440 252 14
        !insertmacro InstallerPlace $InstallerFact2Value 311 456 252 18
        ${NSD_SetText} $InstallerKicker "$(INSTALLER_KICKER_PLATFORM)"
        ${NSD_SetText} $InstallerHeading "$(INSTALLER_PLATFORM_HEADING)"
        ${NSD_SetText} $InstallerDescription "$(INSTALLER_PLATFORM_DESC)"
        ${NSD_SetText} $InstallerFact1Label "$(INSTALLER_PLATFORM_LABEL)"
        ${NSD_SetText} $InstallerFact1Value "$(INSTALLER_PLATFORM_VALUE)"
        ${NSD_SetText} $InstallerFact2Label "$(INSTALLER_SCOPE)"
        ${NSD_SetText} $InstallerFact2Value "$(INSTALLER_SCOPE_CURRENT_USER)"
        ${NSD_SetText} $InstallerFootnote "$(INSTALLER_PLATFORM_NOTE)"
        ${NSD_SetText} $InstallerButton "$(INSTALLER_CONTINUE)"
        ShowWindow $InstallerLocationLabel 0
        ShowWindow $InstallerEditFrame 0
        ShowWindow $InstallerEdit 0
        ShowWindow $InstallerBrowse 0
        ShowWindow $InstallerLaunch 0
        ShowWindow $InstallerLaunchHint 0
        ShowWindow $InstallerCancel 5
    ${Else}
        !insertmacro InstallerPlace $InstallerHeading 37 326 526 39
        !insertmacro InstallerPlace $InstallerDescription 37 376 526 22
        !insertmacro InstallerPlace $InstallerFact1Label 37 580 250 14
        !insertmacro InstallerPlace $InstallerFact1Value 37 596 250 18
        !insertmacro InstallerPlace $InstallerFact2Label 311 580 252 14
        !insertmacro InstallerPlace $InstallerFact2Value 311 596 252 18
        !insertmacro InstallerPlace $InstallerLaunch 37 512 526 22
        !insertmacro InstallerPlace $InstallerLaunchHint 51 534 512 16
        ${NSD_SetText} $InstallerKicker "$(INSTALLER_KICKER_SETUP)"
        ${NSD_SetText} $InstallerHeading "$(INSTALLER_SETUP_HEADING)"
        ${NSD_SetText} $InstallerDescription "$(INSTALLER_SETUP_DESC)"
        ${NSD_SetText} $InstallerLocationLabel "$(INSTALLER_LOCATION_LABEL)"
        ${NSD_SetText} $InstallerFact1Label "$(INSTALLER_SCOPE)"
        ${NSD_SetText} $InstallerFact1Value "$(INSTALLER_SCOPE_CURRENT_USER)"
        ${NSD_SetText} $InstallerFact2Label "$(INSTALLER_PRIVILEGE)"
        ${NSD_SetText} $InstallerFact2Value "$(INSTALLER_PRIVILEGE_STANDARD)"
        ${NSD_SetText} $InstallerFootnote "$(INSTALLER_SETUP_NOTE)"
        ${NSD_SetText} $InstallerButton "$(INSTALLER_INSTALL)"
        ShowWindow $InstallerLocationLabel 5
        ShowWindow $InstallerEditFrame 5
        ShowWindow $InstallerEdit 5
        ShowWindow $InstallerBrowse 5
        ShowWindow $InstallerLaunch 5
        ShowWindow $InstallerLaunchHint 5
        ShowWindow $InstallerCancel 5
    ${EndIf}
    Call InstallerApplyLayout
FunctionEnd

Function InstallerStart
    Pop $0
    ${If} $InstallerPhase == "platform"
        Call InstallerPlatformContinue
        Return
    ${EndIf}
    SendMessage $HWNDPARENT ${WM_NOTIFY_OUTER_NEXT} 1 0
FunctionEnd

Function InstallerCancel
    Pop $0
    System::Call 'user32::PostMessageW(p $HWNDPARENT, i ${WM_CLOSE}, p 0, p 0)'
FunctionEnd

; Page leave callbacks also run when Enter activates NSIS's hidden default button.
Function InstallerWelcomeLeave
    ${If} $InstallerPhase == "platform"
        Call InstallerPlatformContinue
        Abort
    ${EndIf}
    ${NSD_GetText} $InstallerEdit $InstallerPath
    Call InstallerPreflight
    ${If} $InstallerError != ""
        MessageBox MB_OK|MB_ICONEXCLAMATION "$InstallerError"
        Abort
    ${EndIf}
    ${NSD_SetText} $InstallerEdit "$InstallerPath"
    StrCpy $InstallerFieldInvalid 0
    Call InstallerDrawEditFrame
    ${NSD_SetText} $InstallerStatus ""
    ShowWindow $InstallerStatus 0
FunctionEnd

Function InstallerFinishLeave
    ${NSD_GetState} $InstallerLaunch $0
    HideWindow
    ${If} $0 == ${BST_CHECKED}
        StrCpy $0 ""
        ${If} ${isUpdated}
            StrCpy $0 "--updated"
        ${EndIf}
        ClearErrors
        ${If} ${UAC_IsAdmin}
            ; An explicitly elevated installer must still launch through the user's shell.
            ${StdUtils.ExecShellAsUser} $1 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" "$0"
            ${If} $1 != "ok"
            ${AndIf} $1 != "fallback"
                SetErrors
            ${EndIf}
        ${Else}
            ; Per-user installation can create the process without Explorer/shortcut dispatch.
            Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" $0'
        ${EndIf}
        ${If} ${Errors}
            ShowWindow $HWNDPARENT 5
            MessageBox MB_OK|MB_ICONEXCLAMATION "$(INSTALLER_LAUNCH_FAILED)"
            Abort
        ${EndIf}
    ${EndIf}
FunctionEnd

Function InstallerPathChanged
    Pop $0
    ${NSD_CreateTimer} InstallerValidateEditedPath 450
FunctionEnd

; The field frame has no native border, so track edit focus to draw the prototype focus ring.
Function InstallerTrackFieldFocus
    ${NSD_KillTimer} InstallerTrackFieldFocus
    ${If} $InstallerPhase != "welcome"
        Return
    ${EndIf}
    System::Call 'user32::GetFocus() p.r0'
    StrCpy $1 0
    ${If} $0 == $InstallerEdit
        StrCpy $1 1
    ${EndIf}
    ${If} $1 != $InstallerFieldFocused
        StrCpy $InstallerFieldFocused $1
        Call InstallerDrawEditFrame
    ${EndIf}
    ${NSD_CreateTimer} InstallerTrackFieldFocus 200
FunctionEnd

Function InstallerValidateEditedPath
    ${NSD_KillTimer} InstallerValidateEditedPath
    ${If} $InstallerPhase != "welcome"
        Return
    ${EndIf}
    ${NSD_GetText} $InstallerEdit $InstallerPath
    Call InstallerValidatePath
    ${If} $InstallerError == ""
        ${NSD_SetText} $InstallerStatus ""
        ShowWindow $InstallerStatus 0
        ${If} $InstallerFieldInvalid == 1
            StrCpy $InstallerFieldInvalid 0
            Call InstallerDrawEditFrame
        ${EndIf}
    ${Else}
        ${NSD_SetText} $InstallerStatus "$InstallerError"
        ShowWindow $InstallerStatus 5
        ${If} $InstallerFieldInvalid == 0
            StrCpy $InstallerFieldInvalid 1
            Call InstallerDrawEditFrame
        ${EndIf}
    ${EndIf}
FunctionEnd

Function InstallerBrowsePath
    Pop $0
    nsDialogs::SelectFolderDialog "$(INSTALLER_CHOOSE_PATH)" "$InstallerPath"
    Pop $0
    ${If} $0 != "error"
        ${NSD_SetText} $InstallerEdit "$0"
        Call InstallerValidateEditedPath
    ${EndIf}
FunctionEnd

Function InstallerDrag
    Pop $0
    System::Call 'user32::ReleaseCapture()'
    SendMessage $HWNDPARENT ${WM_NCLBUTTONDOWN} 2 0
FunctionEnd

Function InstallerMinimize
    Pop $0
    ShowWindow $HWNDPARENT 6
FunctionEnd

Function InstallerClose
    Pop $0
    System::Call 'user32::PostMessageW(p $HWNDPARENT, i ${WM_CLOSE}, p 0, p 0)'
FunctionEnd
!endif
