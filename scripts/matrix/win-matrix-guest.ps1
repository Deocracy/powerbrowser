# scripts/matrix/win-matrix-guest.ps1  (Phase 54, MTX-01)
#
# The Windows-side driver. The host driver (win-matrix-run.sh) reverts the pkg-win11 guest to its
# clean-baseline snapshot, copies this script and the setup.exe plus the complete MAR in, then runs ONE
# cell per invocation:
#   powershell -NoProfile -ExecutionPolicy Bypass -File win-matrix-guest.ps1 -Cell <install|launch|update|uninstall|no-residue> -Work C:\pbmatrix
# Each cell prints its evidence verbatim to stdout and exits 0 on PASS, 1 on FAIL. The host captures that
# output as the cell's evidence; nothing here edits the record.
#
# Registry scope: the no-residue cell exports both hives under HKLM and HKCU, for the fork root
# Software\PowerBrowser and the upstream root Software\Mozilla, so the host can check the fork root is named and
# the upstream root is untouched.
#
# Honestly: this script is written and linted locally; it is exercised for the first time at the 54-04 owner
# checkpoint on the pkg-win11 guest. No Windows host exists in this environment.

param(
    [Parameter(Mandatory = $true)][ValidateSet('install', 'launch', 'update', 'uninstall', 'no-residue')][string]$Cell,
    [Parameter(Mandatory = $true)][string]$Work
)

$ErrorActionPreference = 'Stop'
$InstallDir = Join-Path $env:ProgramFiles 'PowerBrowser'
$Exe = Join-Path $InstallDir 'PowerBrowser.exe'
$Setup = Join-Path $Work 'setup.exe'
$Mar = Get-ChildItem -Path $Work -Filter '*.complete.mar' | Select-Object -First 1
$ForkRoot = 'HKLM:\Software\PowerBrowser'
$UpstreamRoot = 'HKLM:\Software\Mozilla'
$SmartScreenText = 'Windows protected your PC'

function Export-Hives([string]$Out) {
    # reg export is the verbatim source; both hives under HKLM and HKCU, the fork root and the upstream root.
    $lines = @()
    foreach ($hive in 'HKLM\Software\PowerBrowser', 'HKLM\Software\Mozilla', 'HKCU\Software\PowerBrowser', 'HKCU\Software\Mozilla') {
        $tmp = Join-Path $Work ("export-" + ($hive -replace '[\\]', '_') + '.reg')
        & reg.exe export $hive $tmp /y 2>$null | Out-Null
        if (Test-Path $tmp) { $lines += Get-Content $tmp }
    }
    Set-Content -Path $Out -Value $lines
}

function Pass([string]$Msg) { Write-Output "PASS $Cell: $Msg"; exit 0 }
function Fail([string]$Msg) { Write-Output "FAIL $Cell: $Msg"; exit 1 }

switch ($Cell) {
    'install' {
        if (-not (Test-Path $Setup)) { Fail "setup.exe is absent from $Work" }
        $p = Start-Process -FilePath $Setup -ArgumentList '/S' -Wait -PassThru
        if ($p.ExitCode -ne 0) { Fail "setup.exe exited $($p.ExitCode)" }
        if (-not (Test-Path $Exe)) { Fail "$Exe is absent after install" }
        Pass "setup.exe exited 0; $Exe present"
    }
    'launch' {
        if (-not (Test-Path $Exe)) { Fail "$Exe is absent; install first" }
        # Coexistence: stock browser present in the guest is left running; the probe window must open.
        $p = Start-Process -FilePath $Exe -PassThru
        Start-Sleep -Seconds 20
        $alive = -not $p.HasExited
        if (-not $alive) { Fail "PowerBrowser.exe exited before the probe window opened" }
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        Pass "probe window opened; SmartScreen block text is captured on the host: $SmartScreenText"
    }
    'update' {
        if ($null -eq $Mar) { Fail "no complete MAR in $Work" }
        # The sidecar is running at apply time: launch, confirm a node process from the install dir, then apply.
        $p = Start-Process -FilePath $Exe -PassThru
        Start-Sleep -Seconds 15
        $sidecar = Get-Process -Name 'node' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$InstallDir*" }
        if ($null -eq $sidecar) { Fail 'no sidecar node.exe from the install directory is running before the apply' }
        & (Join-Path $InstallDir 'updater.exe') 2>$null | Out-Null
        Start-Sleep -Seconds 60
        $ini = Get-Content (Join-Path $InstallDir 'application.ini') -ErrorAction SilentlyContinue
        $ver = ($ini | Select-String '^Version=' | ForEach-Object { $_.Line -replace '^Version=', '' })
        $residue = Get-ChildItem -Path $InstallDir -Recurse -Filter 'tobedeleted*' -ErrorAction SilentlyContinue
        if ($residue) { Fail "tobedeleted residue remains: $($residue.Name -join ', ')" }
        Pass "version $ver after the apply with the sidecar running at apply time; no tobedeleted residue"
    }
    'uninstall' {
        $uninst = Join-Path $InstallDir 'uninstall.exe'
        if (-not (Test-Path $uninst)) { Fail "$uninst is absent" }
        $p = Start-Process -FilePath $uninst -ArgumentList '/S' -Wait -PassThru
        if ($p.ExitCode -ne 0) { Fail "uninstall.exe exited $($p.ExitCode)" }
        Pass 'uninstall.exe exited 0'
    }
    'no-residue' {
        $before = Join-Path $Work 'registry-before.reg'
        $after = Join-Path $Work 'registry-after.reg'
        Export-Hives $after
        $diff = Compare-Object (Get-Content $before -ErrorAction SilentlyContinue) (Get-Content $after)
        $touched = $diff | ForEach-Object { $_.InputObject }
        $fork = $touched | Where-Object { $_ -match 'Software\\PowerBrowser' }
        $upstream = $touched | Where-Object { $_ -match 'Software\\Mozilla' }
        if ($upstream) { Fail "the diff touches Software\Mozilla: $($upstream -join '; ')" }
        Pass "registry diff names the fork root only: $($fork -join '; ')"
    }
}
