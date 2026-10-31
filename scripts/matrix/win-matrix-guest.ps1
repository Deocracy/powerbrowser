# scripts/matrix/win-matrix-guest.ps1  (Phase 54, MTX-01)
#
# The Windows-side driver. The host driver (win-matrix-run.sh) reverts the pkg-win11 guest to its
# clean-baseline snapshot ONCE, attaches the read-only inputs ISO (volume label from
# win-matrix-schema.json; it carries this script, the schema, setup.exe and the complete MAR) and then
# runs ONE cell per invocation, in schema order, in the same guest session:
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "& <ISO>\win-matrix-guest.ps1 -Cell <cell> -Work C:\pbmatrix"
# The cells are a chain (install, launch, update, uninstall, no-residue); each leaves what the next one needs
# under -Work, which is guest-local and writable. Each cell prints its evidence verbatim to stdout and exits 0
# on PASS, 1 on FAIL. Lines beginning with a schema marker prefix ($M.<name>.prefix) are OBSERVATIONS taken
# from the OS (the registry, the application.ini, the service control manager, the UI Automation tree); the
# host writer (win-matrix-record.py) turns them into record fields. Nothing here edits the record, and
# nothing prints an observation it did not make.
#
# Session note: the guest agent runs this script as SYSTEM in session 0, which has no desktop. Anything that
# needs the logged-on user's desktop (launching the browser, the SmartScreen dialog, closing the browser
# window) goes through Start-Interactive, a one-shot scheduled task in the logged-on user's session. The
# guest must therefore auto-logon a user (owner setup, BLOCKED.md item 6).
#
# Honestly: this script is written and linted locally; it is exercised for the first time at the 54-04 owner
# checkpoint on the pkg-win11 guest. No Windows host exists in this environment.

param(
    [Parameter(Mandatory = $true)][ValidateSet('install', 'launch', 'update', 'uninstall', 'no-residue')][string]$Cell,
    [Parameter(Mandatory = $true)][string]$Work
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$Inputs = (Get-Volume -FileSystemLabel 'PBMATRIX').DriveLetter + ':\'
$Schema = Get-Content -Raw (Join-Path $Inputs 'win-matrix-schema.json') | ConvertFrom-Json
$M = $Schema.markers
$InstallDir = Join-Path $env:ProgramFiles 'PowerBrowser'
$Exe = Join-Path $InstallDir 'PowerBrowser.exe'
$Setup = Join-Path $Inputs 'setup.exe'
$Mar = Get-ChildItem -Path $Inputs -Filter '*.complete.mar' | Select-Object -First 1
$RegBefore = Join-Path $Work 'registry-before.reg'
$RegInstalled = Join-Path $Work 'registry-installed.reg'
$SmartScreenText = 'Windows protected your PC'

function Pass([string]$Msg) { Write-Output "PASS ${Cell}: $Msg"; exit 0 }
function Fail([string]$Msg) { Write-Output "FAIL ${Cell}: $Msg"; exit 1 }

function Export-Hives([string]$Out) {
    # reg export is the verbatim source: the fork root and the upstream root, under HKLM and HKCU.
    $lines = @()
    foreach ($hive in 'HKLM\Software\PowerBrowser', 'HKLM\Software\Mozilla', 'HKCU\Software\PowerBrowser', 'HKCU\Software\Mozilla') {
        $tmp = Join-Path $Work ('export-' + ($hive -replace '[\\]', '_') + '.reg')
        Remove-Item $tmp -ErrorAction SilentlyContinue
        & reg.exe export $hive $tmp /y 2>$null | Out-Null
        if (Test-Path $tmp) { $lines += Get-Content $tmp }
    }
    Set-Content -Path $Out -Value $lines
}

# Registry keys present in $After and absent from $Before ([HKEY_...] header lines only).
function Get-AddedKeys([string]$Before, [string]$After) {
    $b = if (Test-Path $Before) { Get-Content $Before } else { @() }
    $a = if (Test-Path $After) { Get-Content $After } else { @() }
    Compare-Object $b $a | Where-Object { $_.SideIndicator -eq '=>' -and $_.InputObject -like '`[HKEY*' } | ForEach-Object { $_.InputObject }
}

function Get-AppVersion {
    $ini = Join-Path $InstallDir 'application.ini'
    if (-not (Test-Path $ini)) { return '' }
    (Get-Content $ini | Where-Object { $_ -match '^Version=' } | Select-Object -First 1) -replace '^Version=', ''
}

# Launches a program on the logged-on user's desktop (a one-shot interactive scheduled task) and returns the task name.
function Start-Interactive([string]$File, [string]$ArgString = '') {
    $user = (Get-CimInstance Win32_ComputerSystem).UserName
    if (-not $user) { Fail 'no user is logged on to the guest desktop; the guest must auto-logon (owner setup)' }
    $name = 'pbmatrix-' + [guid]::NewGuid().ToString('N')
    $action = New-ScheduledTaskAction -Execute $File -Argument $ArgString
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive
    Register-ScheduledTask -TaskName $name -Action $action -Principal $principal | Out-Null
    Start-ScheduledTask -TaskName $name
    return $name
}
function Remove-Interactive([string]$Name) { Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue }

function Wait-Until([scriptblock]$Condition, [int]$Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) { if (& $Condition) { return $true }; Start-Sleep -Seconds 1 }
    return $false
}

switch ($Cell) {
    'install' {
        if (-not (Test-Path $Setup)) { Fail "setup.exe is absent from $Inputs" }
        # The registry snapshot the no-residue cell diffs against: taken before the installer runs.
        Export-Hives $RegBefore
        $p = Start-Process -FilePath $Setup -ArgumentList '/S' -Wait -PassThru
        if ($p.ExitCode -ne 0) { Fail "setup.exe exited $($p.ExitCode)" }
        if (-not (Test-Path $Exe)) { Fail "$Exe is absent after install" }
        # Observations from the installed tree: application.ini verbatim, and whether a maintenance service exists.
        Get-Content (Join-Path $InstallDir 'application.ini') | ForEach-Object { Write-Output ($M.ini.prefix + ' ' + $_) }
        $service = (Test-Path (Join-Path $InstallDir 'maintenanceservice.exe')) -or ($null -ne (Get-Service -Name '*Maintenance*' -ErrorAction SilentlyContinue))
        Write-Output ($M.maintenanceService.prefix + ' ' + $(if ($service) { 'enabled' } else { 'disabled' }))
        Pass "setup.exe exited 0; $Exe present"
    }
    'launch' {
        if (-not (Test-Path $Exe)) { Fail "$Exe is absent; install first" }
        # SmartScreen (SEC-03 copy): a Mark-of-the-Web copy of the unsigned installer is started on the desktop
        # and a UI Automation probe looks for the dialog by its title. The probe prints what the OS returned;
        # if no dialog appears nothing is printed and the record's smartscreen field stays empty.
        $motw = Join-Path $Work 'setup-motw.exe'
        Copy-Item $Setup $motw -Force
        Set-Content -Path $motw -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3"
        $probe = Join-Path $Work 'ss-probe.ps1'
        $found = Join-Path $Work 'smartscreen.txt'
        Remove-Item $found -ErrorAction SilentlyContinue
        Set-Content -Path $probe -Value @"
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
`$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '$SmartScreenText')
for (`$i = 0; `$i -lt 40; `$i++) {
    `$el = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants, `$cond)
    if (`$el) { Set-Content -Path '$found' -Value `$el.Current.Name; break }
    Start-Sleep -Seconds 1
}
"@
        $t1 = Start-Interactive $motw
        $t2 = Start-Interactive 'powershell.exe' "-NoProfile -ExecutionPolicy Bypass -File `"$probe`""
        Wait-Until { Test-Path $found } 45 | Out-Null
        Get-Process -Name 'setup-motw' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Remove-Interactive $t1; Remove-Interactive $t2
        if (Test-Path $found) { Write-Output ($M.smartscreen.prefix + ' ' + (Get-Content $found | Select-Object -First 1)) }
        # Coexistence: a stock browser in the guest is left alone; the installed browser must stay up.
        $t3 = Start-Interactive $Exe
        Start-Sleep -Seconds 20
        $app = Get-Process -Name 'PowerBrowser' -ErrorAction SilentlyContinue
        if ($null -eq $app) { Remove-Interactive $t3; Fail 'PowerBrowser.exe is not running 20 seconds after launch' }
        $app | Stop-Process -Force -ErrorAction SilentlyContinue
        Remove-Interactive $t3
        Pass 'PowerBrowser.exe stayed up 20 seconds on the desktop'
    }
    'update' {
        if ($null -eq $Mar) { Fail "no complete MAR on $Inputs" }
        $before = Get-AppVersion
        Write-Output ($M.versionBefore.prefix + ' ' + $before)
        $t = Start-Interactive $Exe
        Start-Sleep -Seconds 20
        $app = Get-Process -Name 'PowerBrowser' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -eq $app) { Remove-Interactive $t; Fail 'PowerBrowser.exe is not running before the apply' }
        $sidecar = @(Get-Process -Name 'node' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$InstallDir*" })
        if ($sidecar.Count -eq 0) { Fail 'no sidecar node.exe from the install directory is running before the apply' }
        Write-Output "sidecar pid(s) before the apply: $($sidecar.Id -join ', ')"
        # The updater's real arguments (toolkit/xre/nsUpdateDriver.cpp:555-562, updater.cpp usage):
        #   updater arg-version patch-dir install-dir apply-to-dir which-invocation wait-pid
        # patch-dir holds update.mar; the updater waits for wait-pid (the browser) to exit, then applies.
        $upd = Join-Path $Work 'update-0'
        Remove-Item $upd -Recurse -Force -ErrorAction SilentlyContinue
        New-Item -ItemType Directory -Path $upd | Out-Null
        Copy-Item $Mar.FullName (Join-Path $upd 'update.mar')
        $u = Start-Process -FilePath (Join-Path $InstallDir 'updater.exe') -ArgumentList @('3', $upd, $InstallDir, $InstallDir, 'first', $app.Id) -PassThru
        # Quit the browser from its own desktop: the quit path runs the sidecar reap blocker before the updater proceeds.
        $q = Start-Interactive 'powershell.exe' '-NoProfile -Command "Get-Process PowerBrowser | ForEach-Object { [void]$_.CloseMainWindow() }"'
        $exited = $u.WaitForExit(180000)
        Remove-Interactive $t; Remove-Interactive $q
        if (-not $exited) { Fail 'updater.exe did not exit within 180 seconds' }
        $status = if (Test-Path (Join-Path $upd 'update.status')) { (Get-Content (Join-Path $upd 'update.status') | Select-Object -First 1) } else { '(no update.status)' }
        Write-Output "updater.exe exit code $($u.ExitCode); update.status: $status"
        $after = Get-AppVersion
        Write-Output ($M.versionAfter.prefix + ' ' + $after)
        if ($u.ExitCode -ne 0 -or $status -notlike 'succeeded*') { Fail "the update did not apply (exit $($u.ExitCode), status $status)" }
        $alive = @($sidecar | Where-Object { Get-Process -Id $_.Id -ErrorAction SilentlyContinue })
        if ($alive.Count -gt 0) { Fail "sidecar pid(s) $($alive.Id -join ', ') were still alive after the apply" }
        if ($after -eq '' -or $after -eq $before) { Fail "the version did not change (before '$before', after '$after')" }
        $residue = Get-ChildItem -Path $InstallDir -Recurse -Filter 'tobedeleted*' -ErrorAction SilentlyContinue
        if ($residue) { Fail "tobedeleted residue remains: $($residue.Name -join ', ')" }
        Pass "version $before -> $after applied; the sidecar was gone; no tobedeleted residue"
    }
    'uninstall' {
        $uninst = Join-Path $InstallDir 'uninstall\helper.exe'
        if (-not (Test-Path $uninst)) { Fail "$uninst is absent" }
        # The registry as the installed, run and updated product leaves it: the no-residue cell diffs this against the snapshot.
        Export-Hives $RegInstalled
        Start-Process -FilePath $uninst -ArgumentList '/S' -Wait | Out-Null
        # The NSIS uninstaller relaunches itself from a temp copy, so the process exit is not the end: wait for the files to go.
        if (-not (Wait-Until { -not (Test-Path $Exe) } 120)) { Fail "$Exe is still present 120 seconds after the uninstaller ran" }
        Pass 'the uninstaller ran silently and removed the application'
    }
    'no-residue' {
        $after = Join-Path $Work 'registry-after.reg'
        Export-Hives $after
        # What the product wrote while installed, and what the uninstall left behind.
        Get-AddedKeys $RegBefore $RegInstalled | ForEach-Object { Write-Output ($M.regDiff.prefix + ' ' + $_) }
        $left = @(Get-AddedKeys $RegBefore $after)
        $left | ForEach-Object { Write-Output ($M.regResidue.prefix + ' ' + $_) }
        if ($left.Count -gt 0) { Fail "$($left.Count) registry key(s) remain after the uninstall" }
        Pass 'no registry key added since the install snapshot remains after the uninstall'
    }
}
