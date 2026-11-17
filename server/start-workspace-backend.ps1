$ErrorActionPreference = "Stop"
$expectedDatabase = "anh_nguyet"
$expectedPort = 5000
$startupTimeoutSeconds = 30

if ($env:DB_NAME -ne $expectedDatabase -or $env:PORT -ne [string]$expectedPort) {
  throw "Cấu hình task phải đặt DB_NAME=anh_nguyet và PORT=5000. Backend chưa được khởi chạy."
}

Write-Output "BACKEND_STARTING database=$expectedDatabase port=$expectedPort"

function Test-BackendPortOpen {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.BeginConnect("127.0.0.1", $expectedPort, $null, $null)
    if (-not $connection.AsyncWaitHandle.WaitOne(500)) { return $false }
    try { $client.EndConnect($connection); return $true }
    catch { return $false }
  }
  finally { $client.Dispose() }
}

if (Test-BackendPortOpen) {
  $deadline = [DateTime]::UtcNow.AddSeconds($startupTimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (-not (Test-BackendPortOpen)) { break }
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$expectedPort/api/health" -Method Get -TimeoutSec 2
      if ($health.success -eq $true -and $health.database -eq "connected" -and $health.databaseName -eq $expectedDatabase) {
        $products = Invoke-RestMethod -Uri "http://127.0.0.1:$expectedPort/api/products" -Method Get -TimeoutSec 5
        if ($products.success -eq $true -and $products.data -is [array]) {
          Write-Output "BACKEND_READY database=$expectedDatabase port=$expectedPort products=$($products.data.Count)"
          exit 0
        }
      }
    }
    catch { }
    Start-Sleep -Milliseconds 500
  }

  if (Test-BackendPortOpen) {
    throw "Cổng 5000 đang được dùng nhưng API chưa xác nhận đúng Backend/database anh_nguyet. Không khởi chạy thêm hoặc dừng tiến trình đang dùng cổng."
  }
}

Push-Location $PSScriptRoot
try {
  & npm.cmd run dev
  if ($LASTEXITCODE -ne 0) {
    throw "npm.cmd run dev kết thúc với mã lỗi $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}
