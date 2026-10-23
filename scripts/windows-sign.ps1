param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
if (-not $env:TASKLENS_SIGN_CERT_THUMBPRINT) { throw 'Signing certificate thumbprint is required' }
if ($env:TASKLENS_SIGN_CERT_THUMBPRINT -notmatch '^[A-Fa-f0-9]{40}$') { throw 'Invalid certificate thumbprint' }
& signtool.exe sign /sha1 $env:TASKLENS_SIGN_CERT_THUMBPRINT /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $Path
if ($LASTEXITCODE -ne 0) { throw 'Authenticode signing failed' }
& signtool.exe verify /pa /all $Path
if ($LASTEXITCODE -ne 0) { throw 'Authenticode verification failed' }
