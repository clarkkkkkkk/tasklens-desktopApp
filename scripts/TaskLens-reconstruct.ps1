# Windows PowerShell 5.1 or PowerShell 7; no Node.js or development tools required.
param(
    [Parameter(Mandatory = $true)][string]$Installer,
    [string]$DownloadTag
)
$ErrorActionPreference = 'Stop'
if ($Installer -notmatch '^TaskLens-[A-Za-z0-9._-]+\.(exe|rpm|deb|AppImage|dmg)$' -or $Installer -match '\.part') { throw 'Invalid installer filename' }
if ($DownloadTag -and $DownloadTag -notmatch '^v[0-9][A-Za-z0-9._-]*$') { throw 'Invalid release tag' }
$target = Join-Path $PWD $Installer
if (Test-Path -LiteralPath $target) { throw 'Refusing to overwrite an existing installer' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$work = Join-Path $PWD ('.tasklens-reconstruct-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$output = $null
try {
    function Get-OfficialFile([string]$Name, [long]$MaxBytes) {
        if (-not $DownloadTag) { throw "Missing file: $Name" }
        $temp = Join-Path $work 'download'
        $url = "https://github.com/clarkkkkkkk/tasklens-desktopApp/releases/download/$DownloadTag/$Name"
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $temp -MaximumRedirection 5
        if ((Get-Item -LiteralPath $temp).Length -gt $MaxBytes) { throw 'Download exceeds supported size' }
        # Move without -Force refuses replacement of an existing local file.
        [IO.File]::Move($temp, (Join-Path $PWD $Name))
    }
    if (-not (Test-Path -LiteralPath './SHA256SUMS')) { Get-OfficialFile 'SHA256SUMS' 1048576 }
    $sums = Get-Item -LiteralPath './SHA256SUMS'
    if ($sums.Length -gt 1048576 -or ($sums.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid checksum inventory' }
    $parts = @()
    $whole = $null
    foreach ($line in Get-Content -LiteralPath $sums.FullName) {
        if ($line -notmatch '^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$') { throw 'Invalid checksum line' }
        $hashValue = $Matches[1]; $name = $Matches[2]
        if ($name -eq $Installer) {
            if ($whole) { throw 'Duplicate installer checksum' }; $whole = $hashValue
        } elseif ($name.StartsWith("$Installer.part", [StringComparison]::Ordinal) -and $name -cne "$Installer.parts.json") {
            $expectedName = '{0}.part{1:D3}' -f $Installer, ($parts.Count + 1)
            if ($parts.Count -ge 32 -or $name -cne $expectedName) { throw 'Missing, duplicated or out-of-order part' }
            $parts += @{ Name = $name; Hash = $hashValue }
        }
    }
    if (-not $whole -or $parts.Count -eq 0) { throw 'Missing installer or part checksums' }
    $partial = Join-Path $work 'installer'
    $output = [IO.File]::Open($partial, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    foreach ($part in $parts) {
        $file = Join-Path $PWD $part.Name
        if (-not (Test-Path -LiteralPath $file)) { Get-OfficialFile $part.Name 1073741824 }
        $info = Get-Item -LiteralPath $file
        if ($info.Length -gt 1073741824 -or $info.PSIsContainer -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid part file' }
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $part.Hash) { throw "Checksum mismatch: $($part.Name)" }
        $inputStream = [IO.File]::OpenRead($file)
        try { $inputStream.CopyTo($output) } finally { $inputStream.Dispose() }
    }
    $output.Dispose(); $output = $null
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -cne $whole) { throw 'Complete installer checksum mismatch' }
    [IO.File]::Move($partial, $target)
    Write-Host "Verified and reconstructed: $Installer"
    Write-Host 'Install this verified file using the platform instructions in the official release notes.'
} finally {
    if ($output) { $output.Dispose() }
    Remove-Item -LiteralPath $work -Recurse -Force
}
