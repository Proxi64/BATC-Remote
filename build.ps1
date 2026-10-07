# BATC Remote — full build: tests + web app + BatcRemote.exe (+ Android APK) into .\dist
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "== Web app: dependencies, type checking, tests, build ==" -ForegroundColor Cyan
Push-Location "$root\src\web"
try {
    npm install
    npm run typecheck
    npm test
    npm run build          # writes into src\host\BatcRemote.Host\wwwroot
} finally { Pop-Location }

Write-Host "== .NET host: publish to .\dist ==" -ForegroundColor Cyan
dotnet publish "$root\src\host\BatcRemote.Host\BatcRemote.Host.csproj" -c Release -r win-x64 -o "$root\dist"

# ---- Android app (optional: only when Android Studio / the Android SDK is installed) ----
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
if (-not $env:JAVA_HOME -and (Test-Path "$env:ProgramFiles\Android\Android Studio\jbr")) {
    $env:JAVA_HOME = "$env:ProgramFiles\Android\Android Studio\jbr"
}
if (Test-Path $env:ANDROID_HOME) {
    # Signed release APK when android\keystore.properties exists (see keystore.properties.example),
    # otherwise a debug APK, for testing only.
    $signed = Test-Path "$root\src\web\android\keystore.properties"
    $task = if ($signed) { "assembleRelease" } else { "assembleDebug" }
    Write-Host "== Android: copy the web app into the project, build the APK ($task) ==" -ForegroundColor Cyan
    Push-Location "$root\src\web"
    try {
        npx cap sync android
        Push-Location android
        try { .\gradlew.bat $task } finally { Pop-Location }
    } finally { Pop-Location }
    if ($signed) {
        Copy-Item "$root\src\web\android\app\build\outputs\apk\release\app-release.apk" "$root\dist\BatcRemote.apk" -Force
        Write-Host "OK -> $root\dist\BatcRemote.apk (signed)" -ForegroundColor Green
    } else {
        Copy-Item "$root\src\web\android\app\build\outputs\apk\debug\app-debug.apk" "$root\dist\BatcRemote-debug.apk" -Force
        Write-Host "OK -> $root\dist\BatcRemote-debug.apk (debug: no android\keystore.properties, not for distribution)" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "(Android SDK not found in $env:ANDROID_HOME: APK skipped)" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "OK -> $root\dist\BatcRemote.exe" -ForegroundColor Green
