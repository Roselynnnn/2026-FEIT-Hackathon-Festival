param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$Root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$Address = [System.Net.IPAddress]::Loopback
$Listener = [System.Net.Sockets.TcpListener]::new($Address, $Port)

$MimeTypes = @{
    ".html"    = "text/html; charset=utf-8"
    ".css"     = "text/css; charset=utf-8"
    ".js"      = "application/javascript; charset=utf-8"
    ".json"    = "application/json; charset=utf-8"
    ".geojson" = "application/geo+json; charset=utf-8"
    ".png"     = "image/png"
    ".jpg"     = "image/jpeg"
    ".jpeg"    = "image/jpeg"
    ".svg"     = "image/svg+xml"
    ".ico"     = "image/x-icon"
}

function Send-Response {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [byte[]]$Body,
        [string]$ContentType = "text/plain; charset=utf-8",
        [bool]$HeadOnly = $false
    )

    $Header = "HTTP/1.1 $StatusCode $StatusText`r`n" +
              "Content-Type: $ContentType`r`n" +
              "Content-Length: $($Body.Length)`r`n" +
              "Cache-Control: no-cache`r`n" +
              "Connection: close`r`n`r`n"
    $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($Header)
    $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
    if (-not $HeadOnly -and $Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
}

try {
    $Listener.Start()
} catch {
    Write-Host "Port $Port is already in use." -ForegroundColor Red
    Write-Host "Close the existing server, or run:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\serve-windows.ps1 -Port 8081"
    exit 1
}

$Url = "http://127.0.0.1:$Port/"
Write-Host "QVM Works Digital Twin is running" -ForegroundColor Green
Write-Host "Open: $Url"
Write-Host "Press Ctrl+C to stop the website."

Start-Process $Url

try {
    while ($true) {
        $Client = $Listener.AcceptTcpClient()
        try {
            $Stream = $Client.GetStream()
            $Reader = [System.IO.StreamReader]::new($Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $RequestLine = $Reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($RequestLine)) {
                continue
            }

            while ($Reader.ReadLine()) { }
            $Parts = $RequestLine.Split(" ")
            $Method = $Parts[0]
            if ($Parts.Length -lt 2 -or ($Method -ne "GET" -and $Method -ne "HEAD")) {
                $Body = [System.Text.Encoding]::UTF8.GetBytes("Method not allowed")
                Send-Response $Stream 405 "Method Not Allowed" $Body
                continue
            }

            $RequestPath = [System.Uri]::UnescapeDataString(($Parts[1] -split "\?", 2)[0]).TrimStart("/")
            if ([string]::IsNullOrWhiteSpace($RequestPath)) {
                $RequestPath = "index.html"
            }

            $LocalPath = [System.IO.Path]::GetFullPath((Join-Path $Root $RequestPath.Replace("/", [System.IO.Path]::DirectorySeparatorChar)))
            if (-not $LocalPath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
                $Body = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
                Send-Response $Stream 403 "Forbidden" $Body
                continue
            }

            if ([System.IO.Directory]::Exists($LocalPath)) {
                $LocalPath = Join-Path $LocalPath "index.html"
            }

            if (-not [System.IO.File]::Exists($LocalPath)) {
                $Body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
                Send-Response $Stream 404 "Not Found" $Body
                continue
            }

            $Body = [System.IO.File]::ReadAllBytes($LocalPath)
            $Extension = [System.IO.Path]::GetExtension($LocalPath).ToLowerInvariant()
            $ContentType = if ($MimeTypes.ContainsKey($Extension)) { $MimeTypes[$Extension] } else { "application/octet-stream" }
            Send-Response $Stream 200 "OK" $Body $ContentType ($Method -eq "HEAD")
        } catch {
            Write-Warning $_.Exception.Message
        } finally {
            if ($null -ne $Reader) { $Reader.Dispose() }
            if ($null -ne $Stream) { $Stream.Dispose() }
            $Client.Close()
        }
    }
} finally {
    $Listener.Stop()
    Write-Host "Server stopped."
}

