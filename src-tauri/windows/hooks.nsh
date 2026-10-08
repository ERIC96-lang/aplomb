; Crochets de l'installeur NSIS d'Aplomb.
;
; Migration « Budget Perso » → « Aplomb » (v1.1.19) : changer le nom du produit
; fait installer l'app dans un nouveau dossier. Une fois Aplomb installé, on
; recrée les raccourcis sous le nouveau nom, puis on retire l'ANCIEN PROGRAMME
; (exécutable, raccourcis, entrée « Applications » de Windows).
; Les données ne sont jamais touchées : elles vivent dans
; %APPDATA%\com.eric.budgetperso et %LOCALAPPDATA%\com.eric.budgetperso
; (liés à l'identifiant, inchangé).

!macro NSIS_HOOK_POSTINSTALL
  ${If} "$INSTDIR" != "$LOCALAPPDATA\Budget Perso"
  ${AndIf} ${FileExists} "$LOCALAPPDATA\Budget Perso\budget-perso-app.exe"
    ; En mode mise à jour, l'installeur de Tauri ne crée aucun raccourci : on
    ; lève ce mode le temps de recréer ceux qui existaient (fonctions officielles,
    ; qui posent aussi l'AppUserModelId nécessaire aux notifications).
    StrCpy $R9 $UpdateMode
    StrCpy $UpdateMode 0
    Call CreateOrUpdateStartMenuShortcut
    ${If} ${FileExists} "$DESKTOP\Budget Perso.lnk"
      Call CreateOrUpdateDesktopShortcut
    ${EndIf}
    StrCpy $UpdateMode $R9

    Delete "$SMPROGRAMS\Budget Perso.lnk"
    Delete "$DESKTOP\Budget Perso.lnk"
    Delete "$LOCALAPPDATA\Budget Perso\budget-perso-app.exe"
    Delete "$LOCALAPPDATA\Budget Perso\uninstall.exe"
    RMDir "$LOCALAPPDATA\Budget Perso"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Budget Perso"
    DeleteRegKey HKCU "Software\eric\Budget Perso"
  ${EndIf}
!macroend
