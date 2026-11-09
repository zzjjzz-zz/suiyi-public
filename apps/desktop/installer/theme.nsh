; Suiyi installer palette, geometry and control colours.
; Design source: prototype workspace-cleanup-20261108-2, product-pages.css at its
; <=640px cascade (the 600px installer window takes the stacked install layout).
; Logical pixels at 96 DPI; every position is scaled with MulDiv at runtime.
; Logical client target: 600×844 from the real 600px prototype install page.
!define INSTALLER_WINDOW_WIDTH 600
!define INSTALLER_WINDOW_HEIGHT 844
!define INSTALLER_CARD_X 16
!define INSTALLER_CARD_Y 216
!define INSTALLER_CARD_W 568
!define INSTALLER_CARD_H 577
!define INSTALLER_CARD_RADIUS 20
!define INSTALLER_CONTENT_X 37
!define INSTALLER_CONTENT_W 526
!define INSTALLER_STEP_X 32
!define INSTALLER_STEP_Y 234
!define INSTALLER_STEP_GAP 162
!define INSTALLER_STEP_BOX 24
!define INSTALLER_STEP_LABEL_X 64
!define INSTALLER_FIELD_X 37
!define INSTALLER_FIELD_Y 418
!define INSTALLER_FIELD_W 414
!define INSTALLER_FIELD_H 44
!define INSTALLER_FIELD_RADIUS 11
!define INSTALLER_BROWSE_X 459
!define INSTALLER_BROWSE_Y 418
!define INSTALLER_BROWSE_W 104
!define INSTALLER_BROWSE_H 44
!define INSTALLER_ACTION_Y 730
!define INSTALLER_ACTION_H 42
!define INSTALLER_CANCEL_X 37
!define INSTALLER_CANCEL_W 96
!define INSTALLER_INSTALL_X 403
!define INSTALLER_INSTALL_W 160
!define INSTALLER_FOOTNOTE_X 16
!define INSTALLER_FOOTNOTE_Y 808
!define INSTALLER_FOOTNOTE_W 568
!define INSTALLER_FOOTNOTE_H 17
!define INSTALLER_CAPTION_MIN_X 504
!define INSTALLER_CAPTION_CLOSE_X 548
!define INSTALLER_CAPTION_Y 8
!define INSTALLER_CAPTION_W 40
!define INSTALLER_CAPTION_H 32
; The prototype font stack is 'Noto Sans SC','PingFang SC','Microsoft YaHei',
; sans-serif. The Windows build embeds the three static Noto Sans SC faces under
; installer/fonts and loads them privately for this process; no system font is installed.
; Family names and SHA-256 values live in installer/fonts/native-fonts.json.
!define INSTALLER_FONT_LIGHT "Noto Sans SC Light"
!define INSTALLER_FONT "Noto Sans SC"
!define INSTALLER_FONT_MEDIUM "Noto Sans SC Medium"
!define INSTALLER_BUTTON_FONT_SIZE 13
!define INSTALLER_BODY_FONT_SIZE 12
!define INSTALLER_LABEL_FONT_SIZE 10
!define INSTALLER_TITLE_FONT_SIZE 26
!define INSTALLER_HEADING_FONT_SIZE 23
!define INSTALLER_STEP_FONT_SIZE 10
!define INSTALLER_BUTTON_DIAMETER 24
!define INSTALLER_CAPTION_DIAMETER 20

; GDI+ ARGB values (0xAARRGGBB). SetCtlColors uses separate RRGGBB literals
; because it converts colours at compile time and rejects variables.
!define INSTALLER_LIGHT_BG 0xFFEDF5FF
!define INSTALLER_DARK_BG 0xFF061122
!define INSTALLER_LIGHT_CARD 0xFFFFFFFF
!define INSTALLER_DARK_CARD 0xFF16263A
!define INSTALLER_LIGHT_FIELD 0xFFF6F8FC
!define INSTALLER_DARK_FIELD 0xFF1B3049
!define INSTALLER_LIGHT_BORDER 0xFFDCE6F3
!define INSTALLER_DARK_BORDER 0xFF2E4259
!define INSTALLER_LIGHT_FIELD_BORDER 0xFFD7E2F0
!define INSTALLER_DARK_FIELD_BORDER 0xFF33475F
!define INSTALLER_LIGHT_ACCENT 0xFF2367D9
!define INSTALLER_DARK_ACCENT 0xFFA0C7FF
!define INSTALLER_LIGHT_ACCENT_HOVER 0xFF2C74E8
!define INSTALLER_DARK_ACCENT_HOVER 0xFFB8D6FF
!define INSTALLER_LIGHT_ACCENT_PRESSED 0xFF1B56B8
!define INSTALLER_DARK_ACCENT_PRESSED 0xFF8FB8F0
!define INSTALLER_LIGHT_ACCENT_INK 0xFF1655B8
!define INSTALLER_DARK_ACCENT_INK 0xFFB8D6FF
!define INSTALLER_LIGHT_ACCENT_WASH 0xFFE4EFFF
!define INSTALLER_DARK_ACCENT_WASH 0xFF203A59
!define INSTALLER_LIGHT_CYAN 0xFF15A3BE
!define INSTALLER_DARK_CYAN 0xFF6BDEEC
!define INSTALLER_LIGHT_TEXT 0xFF20242D
!define INSTALLER_DARK_TEXT 0xFFEDF0F7
!define INSTALLER_LIGHT_PRIMARY_TEXT 0xFFFFFFFF
!define INSTALLER_DARK_PRIMARY_TEXT 0xFF102A49
!define INSTALLER_LIGHT_MUTED 0xFF53667D
!define INSTALLER_DARK_MUTED 0xFFA8BFD8
!define INSTALLER_LIGHT_ERROR 0xFFB42318
!define INSTALLER_DARK_ERROR 0xFFFCA5A5
!define INSTALLER_LIGHT_ERROR_WASH 0xFFFFF1F0
!define INSTALLER_DARK_ERROR_WASH 0xFF3A2022
!define INSTALLER_LIGHT_SUCCESS_INK 0xFF1E7A44
!define INSTALLER_DARK_SUCCESS_INK 0xFF8CDDA6
!define INSTALLER_LIGHT_CARD_HOVER 0xFFE4EFFF
!define INSTALLER_DARK_CARD_HOVER 0xFF203A59
!define INSTALLER_LIGHT_CARD_PRESSED 0xFFD4E3FA
!define INSTALLER_DARK_CARD_PRESSED 0xFF2B4A6B
; Caption hover/pressed names are also read by the native render check.
!define INSTALLER_CONTROL_HOVER 0xFFEEF1F6
!define INSTALLER_CONTROL_PRESSED 0xFFDCE3EE
!define INSTALLER_DARK_CONTROL_HOVER 0xFF292F3B
!define INSTALLER_DARK_CONTROL_PRESSED 0xFF39404D

Var InstallerTheme
Var InstallerDark
Var InstallerBgArgb
Var InstallerBgColorref
Var InstallerCardArgb
Var InstallerCardColorref
Var InstallerFieldArgb
Var InstallerFieldColorref
Var InstallerFieldBorderArgb
Var InstallerTextColorref
Var InstallerMutedColorref
Var InstallerPrimaryTextColorref
Var InstallerPrimary
Var InstallerPrimaryHover
Var InstallerPrimaryPressed
Var InstallerErrorArgb
Var InstallerCaptionHover
Var InstallerCaptionPressed
Var InstallerCardHover
Var InstallerCardPressed

; SetCtlColors accepts only compile-time colours; choose between the two native palettes.
!macro InstallerPageColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} EDF0F7 061122
    ${Else}
        SetCtlColors ${HANDLE} 20242D EDF5FF
    ${EndIf}
!macroend

!macro InstallerPageMutedColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} A8BFD8 061122
    ${Else}
        SetCtlColors ${HANDLE} 53667D EDF5FF
    ${EndIf}
!macroend

!macro InstallerPageTransparentColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} EDF0F7 transparent
    ${Else}
        SetCtlColors ${HANDLE} 20242D transparent
    ${EndIf}
!macroend

!macro InstallerPageTransparentMutedColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} A8BFD8 transparent
    ${Else}
        SetCtlColors ${HANDLE} 53667D transparent
    ${EndIf}
!macroend

!macro InstallerCardColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} EDF0F7 16263A
    ${Else}
        SetCtlColors ${HANDLE} 20242D FFFFFF
    ${EndIf}
!macroend

!macro InstallerCardMutedColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} A8BFD8 16263A
    ${Else}
        SetCtlColors ${HANDLE} 53667D FFFFFF
    ${EndIf}
!macroend

!macro InstallerCardAccentColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} B8D6FF 16263A
    ${Else}
        SetCtlColors ${HANDLE} 1655B8 FFFFFF
    ${EndIf}
!macroend

!macro InstallerFieldColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} EDF0F7 1B3049
    ${Else}
        SetCtlColors ${HANDLE} 20242D F6F8FC
    ${EndIf}
!macroend

!macro InstallerErrorColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} FCA5A5 16263A
    ${Else}
        SetCtlColors ${HANDLE} B42318 FFFFFF
    ${EndIf}
!macroend

!macro InstallerCaptionColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} EDF0F7 061122
    ${Else}
        SetCtlColors ${HANDLE} 20242D EDF5FF
    ${EndIf}
!macroend

Function InstallerResolveTheme
    ${If} $InstallerTheme == "auto"
        ClearErrors
        ReadRegDWORD $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" "AppsUseLightTheme"
        ${If} ${Errors}
            StrCpy $0 1
        ${EndIf}
        ${If} $0 == 0
            StrCpy $InstallerTheme "dark"
        ${Else}
            StrCpy $InstallerTheme "light"
        ${EndIf}
    ${EndIf}
    ${If} $InstallerTheme == "dark"
        StrCpy $InstallerDark 1
        StrCpy $InstallerBgArgb ${INSTALLER_DARK_BG}
        StrCpy $InstallerBgColorref 0x221106
        StrCpy $InstallerCardArgb ${INSTALLER_DARK_CARD}
        StrCpy $InstallerCardColorref 0x3A2616
        StrCpy $InstallerFieldArgb ${INSTALLER_DARK_FIELD}
        StrCpy $InstallerFieldColorref 0x49301B
        StrCpy $InstallerFieldBorderArgb ${INSTALLER_DARK_FIELD_BORDER}
        StrCpy $InstallerTextColorref 0xF7F0ED
        StrCpy $InstallerMutedColorref 0xD8BFA8
        StrCpy $InstallerPrimaryTextColorref 0x492A10
        StrCpy $InstallerPrimary ${INSTALLER_DARK_ACCENT}
        StrCpy $InstallerPrimaryHover ${INSTALLER_DARK_ACCENT_HOVER}
        StrCpy $InstallerPrimaryPressed ${INSTALLER_DARK_ACCENT_PRESSED}
        StrCpy $InstallerErrorArgb ${INSTALLER_DARK_ERROR}
        StrCpy $InstallerCaptionHover ${INSTALLER_DARK_CONTROL_HOVER}
        StrCpy $InstallerCaptionPressed ${INSTALLER_DARK_CONTROL_PRESSED}
        StrCpy $InstallerCardHover ${INSTALLER_DARK_CARD_HOVER}
        StrCpy $InstallerCardPressed ${INSTALLER_DARK_CARD_PRESSED}
    ${Else}
        StrCpy $InstallerDark 0
        StrCpy $InstallerBgArgb ${INSTALLER_LIGHT_BG}
        StrCpy $InstallerBgColorref 0xFFF5ED
        StrCpy $InstallerCardArgb ${INSTALLER_LIGHT_CARD}
        StrCpy $InstallerCardColorref 0xFFFFFF
        StrCpy $InstallerFieldArgb ${INSTALLER_LIGHT_FIELD}
        StrCpy $InstallerFieldColorref 0xFCF8F6
        StrCpy $InstallerFieldBorderArgb ${INSTALLER_LIGHT_FIELD_BORDER}
        StrCpy $InstallerTextColorref 0x2D2420
        StrCpy $InstallerMutedColorref 0x7D6653
        StrCpy $InstallerPrimaryTextColorref 0xFFFFFF
        StrCpy $InstallerPrimary ${INSTALLER_LIGHT_ACCENT}
        StrCpy $InstallerPrimaryHover ${INSTALLER_LIGHT_ACCENT_HOVER}
        StrCpy $InstallerPrimaryPressed ${INSTALLER_LIGHT_ACCENT_PRESSED}
        StrCpy $InstallerErrorArgb ${INSTALLER_LIGHT_ERROR}
        StrCpy $InstallerCaptionHover ${INSTALLER_CONTROL_HOVER}
        StrCpy $InstallerCaptionPressed ${INSTALLER_CONTROL_PRESSED}
        StrCpy $InstallerCardHover ${INSTALLER_LIGHT_CARD_HOVER}
        StrCpy $InstallerCardPressed ${INSTALLER_LIGHT_CARD_PRESSED}
    ${EndIf}
FunctionEnd
