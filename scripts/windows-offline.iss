; Build with Inno Setup 6.5.2+ on Windows x64. No online bootstrapper.
#if Ver < EncodeVer(6, 5, 2, 0)
  #error TaskLens requires Inno Setup 6.5.2 or newer for its single offline installer payload.
#endif
#ifndef Stage
  #error Stage is required
#endif
[Setup]
AppId=TaskLens
AppName=TaskLens
AppPublisher=TaskLens contributors
AppPublisherURL=https://github.com/clarkkkkkkk/tasklens-desktopApp
AppSupportURL=https://github.com/clarkkkkkkk/tasklens-desktopApp/issues
MinVersion=10.0
AppVersion={#AppVersion}
DefaultDirName={localappdata}\TaskLens
DefaultGroupName=TaskLens
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#Stage}\..\bundle\inno
OutputBaseFilename=TaskLens-Setup-{#AppVersion}-windows-x64
Compression=lzma2
SolidCompression=yes
SetupIconFile=..\src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\tasklens.exe
CloseApplications=yes
#ifdef SignEnabled
SignTool=TaskLens
SignedUninstaller=yes
#endif
[Files]
Source: "{#Stage}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "WebView2Setup.exe"
Source: "{#Stage}\WebView2Setup.exe"; DestDir: "{tmp}"; Flags: dontcopy
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
[Icons]
Name: "{group}\TaskLens"; Filename: "{app}\tasklens.exe"
Name: "{autodesktop}\TaskLens"; Filename: "{app}\tasklens.exe"; Tasks: desktopicon
[Code]
function NeedsWebView2: Boolean;
var Version: String;
begin
  Result := not ((RegQueryStringValue(HKLM32, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) or
    RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version)) and (Version <> '') and (Version <> '0.0.0.0'));
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
var ResultCode: Integer;
begin
  Result := '';
  if NeedsWebView2 then begin
    ExtractTemporaryFile('WebView2Setup.exe');
    if not Exec(ExpandConstant('{tmp}\WebView2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      Result := 'Unable to start the bundled offline WebView2 installer.'
    else if (ResultCode <> 0) and (ResultCode <> 3010) then
      Result := Format('Offline WebView2 installation failed (exit %d).', [ResultCode])
    else begin
      NeedsRestart := ResultCode = 3010;
      if NeedsWebView2 then Result := 'WebView2 was not detected after installation. Restart Windows and retry.';
    end;
  end;
end;
