; Windows GDI+ supplies antialiasing for the native controls.
Var InstallerGdiToken
Var InstallerEditFrameBitmap
Var InstallerEditFrameOld
Var InstallerFieldInvalid
Var InstallerFieldFocused

!macro InstallerPixelFont HANDLE SIZE WEIGHT
    System::Call 'kernel32::MulDiv(i -${SIZE}, i $InstallerDpi, i 96) i.r0'
    ; Static Noto Sans SC files expose Light/Regular/Medium as three families.
    !if ${WEIGHT} >= 500
        System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i ${WEIGHT}, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "${INSTALLER_FONT_MEDIUM}") p.s'
    !else
        !if ${WEIGHT} <= 300
            System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i ${WEIGHT}, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "${INSTALLER_FONT_LIGHT}") p.s'
        !else
            System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i ${WEIGHT}, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "${INSTALLER_FONT}") p.s'
        !endif
    !endif
    Pop ${HANDLE}
!macroend

; Produces a closed rounded rectangle. Inputs and output must not use $0/$1.
!macro InstallerRoundPath PATH WIDTH HEIGHT DIAMETER
    System::Call 'gdiplus::GdipCreatePath(i 0, *p .s)'
    Pop ${PATH}
    IntOp $0 ${WIDTH} - ${DIAMETER}
    IntOp $1 ${HEIGHT} - ${DIAMETER}
    ; System.dll has no float argument type. The arc angles use IEEE-754 bits.
    System::Call 'gdiplus::GdipAddPathArcI(p ${PATH}, i 0, i 0, i ${DIAMETER}, i ${DIAMETER}, i 0x43340000, i 0x42B40000)'
    System::Call 'gdiplus::GdipAddPathArcI(p ${PATH}, i r0, i 0, i ${DIAMETER}, i ${DIAMETER}, i 0x43870000, i 0x42B40000)'
    System::Call 'gdiplus::GdipAddPathArcI(p ${PATH}, i r0, i r1, i ${DIAMETER}, i ${DIAMETER}, i 0, i 0x42B40000)'
    System::Call 'gdiplus::GdipAddPathArcI(p ${PATH}, i 0, i r1, i ${DIAMETER}, i ${DIAMETER}, i 0x42B40000, i 0x42B40000)'
    System::Call 'gdiplus::GdipClosePathFigure(p ${PATH})'
!macroend

; Draws the field contour into a bitmap behind the borderless edit control.
; The invalid border is redrawn in place, so the edit keeps focus and text.
Function InstallerDrawEditFrame
    System::Call 'kernel32::MulDiv(i $InstallerFieldW, i $InstallerDpi, i 96) i.R7'
    System::Call 'kernel32::MulDiv(i $InstallerFieldH, i $InstallerDpi, i 96) i.R8'
    System::Call 'kernel32::MulDiv(i ${INSTALLER_FIELD_RADIUS}, i $InstallerDpi, i 96) i.R3'
    System::Call 'gdiplus::GdipCreateBitmapFromScan0(i R7, i R8, i 0, i 0x26200A, p 0, *p .R5)'
    System::Call 'gdiplus::GdipGetImageGraphicsContext(p R5, *p .R4)'
    System::Call 'gdiplus::GdipGraphicsClear(p R4, i $InstallerFieldArgb)'
    System::Call 'gdiplus::GdipSetSmoothingMode(p R4, i 4)'
    IntOp $R7 $R7 - 1
    IntOp $R8 $R8 - 1
    !insertmacro InstallerRoundPath $R6 $R7 $R8 $R3
    ${If} $InstallerFieldInvalid == 1
        System::Call 'gdiplus::GdipCreatePen1(i $InstallerErrorArgb, i 0x40000000, i 2, *p .R1)'
    ${ElseIf} $InstallerFieldFocused == 1
        System::Call 'gdiplus::GdipCreatePen1(i $InstallerPrimary, i 0x40000000, i 2, *p .R1)'
    ${Else}
        System::Call 'gdiplus::GdipCreatePen1(i $InstallerFieldBorderArgb, i 0x40000000, i 2, *p .R1)'
    ${EndIf}
    System::Call 'gdiplus::GdipDrawPath(p R4, p R1, p R6)'
    System::Call 'gdiplus::GdipCreateHBITMAPFromBitmap(p R5, *p .s, i $InstallerFieldArgb)'
    Pop $R9
    StrCpy $InstallerEditFrameOld 0
    ${If} $InstallerEditFrameBitmap != 0
        StrCpy $InstallerEditFrameOld $InstallerEditFrameBitmap
    ${EndIf}
    StrCpy $InstallerEditFrameBitmap $R9
    SendMessage $InstallerEditFrame ${STM_SETIMAGE} ${IMAGE_BITMAP} $InstallerEditFrameBitmap
    ; The static owns the previous image until this replacement is installed.
    ${If} $InstallerEditFrameOld != 0
        System::Call 'gdi32::DeleteObject(p $InstallerEditFrameOld)'
    ${EndIf}
    System::Call 'gdiplus::GdipDeletePen(p R1)'
    System::Call 'gdiplus::GdipDeletePath(p R6)'
    System::Call 'gdiplus::GdipDeleteGraphics(p R4)'
    System::Call 'gdiplus::GdipDisposeImage(p R5)'
FunctionEnd

; Copy the underlying glass surface before drawing an interactive control.
!macro InstallerControlBackdrop DC CONTROL RECT
    System::Call '*${RECT}(i, i, i .r0, i .r1)'
    System::Call 'user32::MapWindowPoints(p ${CONTROL}, p $InstallerBackdrop, p ${RECT}, i 2)'
    System::Call '*${RECT}(i .r2, i .r3)'
    System::Call 'gdi32::CreateCompatibleDC(p ${DC}) p.r4'
    System::Call 'gdi32::SelectObject(p r4, p $InstallerBackdropBitmap) p.r5'
    System::Call 'gdi32::BitBlt(p ${DC}, i 0, i 0, i r0, i r1, p r4, i r2, i r3, i 0x00CC0020)'
    System::Call 'gdi32::SelectObject(p r4, p r5)'
    System::Call 'gdi32::DeleteDC(p r4)'
    System::Call 'user32::GetClientRect(p ${CONTROL}, p ${RECT})'
!macroend

; BS_AUTOCHECKBOX retains its native state, text, keyboard and accessibility role.
Function InstallerPaintCheckbox
    Pop $R0
    Pop $R1
    Pop $R2
    ${If} $R1 != -12
        Return
    ${EndIf}
    System::Call '*$R2(p, p, i, i .R3, p .R4, i, i, i, i, p, i .R9)'
    ${If} $R3 != 1
        Return
    ${EndIf}
    System::Call 'gdi32::SaveDC(p R4)'
    System::Alloc 16
    Pop $R2
    System::Call 'user32::GetClientRect(p R0, p R2)'
    !insertmacro InstallerControlBackdrop $R4 $R0 $R2
    StrCpy $R7 18
    StrCpy $0 8
    StrCpy $1 2
    ${If} $R0 == $InstallerShortcut
    ${OrIf} $R0 == $InstallerStartup
        StrCpy $R7 16
        StrCpy $0 0
        StrCpy $1 3
    ${EndIf}
    System::Call 'kernel32::MulDiv(i r0, i $InstallerDpi, i 96) i.r2'
    System::Call 'kernel32::MulDiv(i r1, i $InstallerDpi, i 96) i.r3'
    System::Call 'gdi32::SetViewportOrgEx(p R4, i r2, i r3, p 0)'
    System::Call 'gdiplus::GdipCreateFromHDC(p R4, *p .R5)'
    System::Call 'gdiplus::GdipSetSmoothingMode(p R5, i 4)'
    System::Call 'kernel32::MulDiv(i R7, i $InstallerDpi, i 96) i.R7'
    StrCpy $R8 $R7
    System::Call 'kernel32::MulDiv(i 4, i $InstallerDpi, i 96) i.R3'
    !insertmacro InstallerRoundPath $R6 $R7 $R8 $R3
    ${NSD_GetState} $R0 $R8
    StrCpy $R3 $InstallerFieldArgb
    ${If} $R8 == ${BST_CHECKED}
        StrCpy $R3 $InstallerPrimary
    ${EndIf}
    System::Call 'gdiplus::GdipCreateSolidFill(i R3, *p .R1)'
    System::Call 'gdiplus::GdipFillPath(p R5, p R1, p R6)'
    System::Call 'gdiplus::GdipDeleteBrush(p R1)'
    ${If} $R8 != ${BST_CHECKED}
        System::Call 'gdiplus::GdipCreatePen1(i $InstallerFieldBorderArgb, i 0x40000000, i 2, *p .R1)'
        System::Call 'gdiplus::GdipDrawPath(p R5, p R1, p R6)'
        System::Call 'gdiplus::GdipDeletePen(p R1)'
    ${EndIf}
    System::Call 'gdiplus::GdipDeletePath(p R6)'
    System::Call 'gdiplus::GdipDeleteGraphics(p R5)'
    ${If} $R8 == ${BST_CHECKED}
        System::Call 'kernel32::MulDiv(i 2, i $InstallerDpi, i 96) i.r0'
        System::Call 'gdi32::CreatePen(i 0, i r0, i $InstallerPrimaryTextColorref) p.R1'
        System::Call 'gdi32::SelectObject(p R4, p R1) p.R3'
        System::Call 'kernel32::MulDiv(i 4, i $InstallerDpi, i 96) i.r0'
        System::Call 'kernel32::MulDiv(i 9, i $InstallerDpi, i 96) i.r1'
        System::Call 'gdi32::MoveToEx(p R4, i r0, i r1, p 0)'
        System::Call 'kernel32::MulDiv(i 8, i $InstallerDpi, i 96) i.r0'
        System::Call 'kernel32::MulDiv(i 13, i $InstallerDpi, i 96) i.r1'
        System::Call 'gdi32::LineTo(p R4, i r0, i r1)'
        System::Call 'kernel32::MulDiv(i 14, i $InstallerDpi, i 96) i.r0'
        System::Call 'kernel32::MulDiv(i 5, i $InstallerDpi, i 96) i.r1'
        System::Call 'gdi32::LineTo(p R4, i r0, i r1)'
        System::Call 'gdi32::SelectObject(p R4, p R3)'
        System::Call 'gdi32::DeleteObject(p R1)'
    ${EndIf}
    System::Call 'gdi32::SetViewportOrgEx(p R4, i 0, i 0, p 0)'
    StrCpy $0 34
    ${If} $R0 == $InstallerShortcut
    ${OrIf} $R0 == $InstallerStartup
        StrCpy $0 26
    ${EndIf}
    System::Call 'kernel32::MulDiv(i r0, i $InstallerDpi, i 96) i.r0'
    System::Call '*$R2(i r0)'
    System::Call 'gdi32::SetBkMode(p R4, i 1)'
    System::Call 'gdi32::SetTextColor(p R4, i $InstallerTextColorref)'
    System::Call 'user32::IsWindowEnabled(p R0) i.r0'
    ${If} $0 == 0
        System::Call 'gdi32::SetTextColor(p R4, i $InstallerMutedColorref)'
    ${EndIf}
    System::Call 'gdi32::SelectObject(p R4, p $InstallerSmallFont)'
    ${NSD_GetText} $R0 $R8
    System::Call 'user32::DrawTextW(p R4, w R8, i -1, p R2, i 0x24)'
    IntOp $R9 $R9 & 16
    ${If} $R9 != 0
        System::Call 'user32::DrawFocusRect(p R4, p R2)'
    ${EndIf}
    System::Call 'gdi32::RestoreDC(p R4, i -1)'
    System::Free $R2
    ${NSD_Return} 4
FunctionEnd

; NM_CUSTOMDRAW keeps native button focus, keyboard input and accessible text.
; This NMCUSTOMDRAW layout is for the x86 NSIS stub, including on x64 Windows.
Function InstallerPaintButton
    Pop $R0
    Pop $R1
    Pop $R2
    ${If} $R1 != -12
        Return
    ${EndIf}
    System::Call '*$R2(p, p, i, i .R3, p .R4, i .R5, i .R6, i .R7, i .R8, p, i .R9)'
    ${If} $R3 != 1
        Return
    ${EndIf}
    System::Call 'gdi32::SaveDC(p R4)'
    System::Alloc 16
    Pop $R2
    System::Call 'user32::GetClientRect(p R0, p R2)'
    ${If} $R0 == $InstallerMinimizeButton
    ${OrIf} $R0 == $InstallerCloseButton
        System::Call 'gdi32::CreateSolidBrush(i $InstallerBgColorref) p.R3'
    ${Else}
        System::Call 'gdi32::CreateSolidBrush(i $InstallerCardColorref) p.R3'
    ${EndIf}
    System::Call 'user32::FillRect(p R4, p R2, p R3)'
    System::Call 'gdi32::DeleteObject(p R3)'
    ; Surface fill: primary accent, card controls on card, caption buttons on the page.
    StrCpy $R3 $InstallerCardArgb
    ${If} $R0 == $InstallerButton
        StrCpy $R3 $InstallerPrimary
        IntOp $R1 $R9 & 64
        ${If} $R1 != 0
            StrCpy $R3 $InstallerPrimaryHover
        ${EndIf}
        IntOp $R1 $R9 & 1
        ${If} $R1 != 0
            StrCpy $R3 $InstallerPrimaryPressed
        ${EndIf}
    ${ElseIf} $R0 == $InstallerMinimizeButton
    ${OrIf} $R0 == $InstallerCloseButton
        StrCpy $R3 $InstallerBgArgb
        IntOp $R1 $R9 & 65
        ${If} $R1 != 0
            StrCpy $R3 $InstallerCaptionHover
        ${EndIf}
        IntOp $R1 $R9 & 1
        ${If} $R1 != 0
            StrCpy $R3 $InstallerCaptionPressed
        ${EndIf}
    ${Else}
        IntOp $R1 $R9 & 65
        ${If} $R1 != 0
            StrCpy $R3 $InstallerCardHover
        ${EndIf}
        IntOp $R1 $R9 & 1
        ${If} $R1 != 0
            StrCpy $R3 $InstallerCardPressed
        ${EndIf}
    ${EndIf}
    System::Call 'gdiplus::GdipCreateSolidFill(i R3, *p .R1)'
    System::Call 'gdiplus::GdipCreateFromHDC(p R4, *p .R5)'
    System::Call 'gdiplus::GdipSetSmoothingMode(p R5, i 4)'
    System::Call 'gdiplus::GdipSetPixelOffsetMode(p R5, i 4)'
    System::Call 'kernel32::MulDiv(i ${INSTALLER_BUTTON_DIAMETER}, i $InstallerDpi, i 96) i.R3'
    ${If} $R0 == $InstallerBrowse
    ${OrIf} $R0 == $InstallerMinimizeButton
    ${OrIf} $R0 == $InstallerCloseButton
        System::Call 'kernel32::MulDiv(i ${INSTALLER_CAPTION_DIAMETER}, i $InstallerDpi, i 96) i.R3'
    ${EndIf}
    !insertmacro InstallerRoundPath $R6 $R7 $R8 $R3
    System::Call 'gdiplus::GdipFillPath(p R5, p R1, p R6)'
    ${If} $R0 == $InstallerBrowse
        System::Call 'gdiplus::GdipCreatePen1(i $InstallerFieldBorderArgb, i 0x40000000, i 2, *p .r2)'
        System::Call 'gdiplus::GdipDrawPath(p R5, p r2, p R6)'
        System::Call 'gdiplus::GdipDeletePen(p r2)'
    ${EndIf}
    System::Call 'gdiplus::GdipDeletePath(p R6)'
    System::Call 'gdiplus::GdipDeleteGraphics(p R5)'
    System::Call 'gdiplus::GdipDeleteBrush(p R1)'
    System::Call 'gdi32::SetBkMode(p R4, i 1)'
    ${If} $R0 == $InstallerButton
        System::Call 'gdi32::SetTextColor(p R4, i $InstallerPrimaryTextColorref)'
    ${ElseIf} $R0 == $InstallerCancel
        System::Call 'gdi32::SetTextColor(p R4, i $InstallerMutedColorref)'
    ${ElseIf} $R0 == $InstallerMinimizeButton
    ${OrIf} $R0 == $InstallerCloseButton
        System::Call 'gdi32::SetTextColor(p R4, i $InstallerMutedColorref)'
    ${Else}
        System::Call 'gdi32::SetTextColor(p R4, i $InstallerTextColorref)'
    ${EndIf}
    System::Call 'gdi32::SelectObject(p R4, p $InstallerFont)'
    ${NSD_GetText} $R0 $R3
    System::Call 'user32::DrawTextW(p R4, w R3, i -1, p R2, i 0x25)'
    IntOp $R9 $R9 & 16
    ${If} $R9 != 0
        System::Call 'user32::InflateRect(p R2, i -4, i -4)'
        System::Call 'user32::DrawFocusRect(p R4, p R2)'
    ${EndIf}
    System::Call 'gdi32::RestoreDC(p R4, i -1)'
    System::Free $R2
    ${NSD_Return} 4
FunctionEnd
