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
AppVersion={#AppVersion}
DefaultDirName={localappdata}\TaskLens
DefaultGroupName=TaskLens
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#Stage}\..\bundle\inno
OutputBaseFilename=TaskLens_{#AppVersion}_x64-offline-setup
Compression=lzma2
SolidCompression=yes
SetupIconFile=..\src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\tasklens.exe
CloseApplications=yes
[Files]
Source: "{#Stage}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "WebView2Setup.exe"
Source: "{#Stage}\WebView2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall
[Icons]
Name: "{group}\TaskLens"; Filename: "{app}\tasklens.exe"
[Run]
Filename: "{tmp}\WebView2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Preparing the offline application runtime…"; Flags: waituntilterminated; Check: NeedsWebView2
[Code]
function NeedsWebView2: Boolean;
var Version: String;
begin
  Result := not (RegQueryStringValue(HKLM32, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) or
    RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version));
end;
