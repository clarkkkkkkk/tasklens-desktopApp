param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
$signature = Get-AuthenticodeSignature -LiteralPath $Path
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(?:^|,\s*)O=Microsoft Corporation(?:,|$)') {
  throw 'Offline WebView2 installer must have a valid Microsoft Authenticode signature'
}
if ((Get-Item -LiteralPath $Path).Length -lt 10000000) { throw 'Provide the offline standalone installer, not the online bootstrapper' }
Write-Output 'Verified Microsoft signature on offline WebView2 payload'
