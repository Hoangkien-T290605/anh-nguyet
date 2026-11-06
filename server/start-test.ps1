$testDatabase = "anh_nguyet_restore_test_20261106"
$testPort = "5011"
$previousLocation = Get-Location
$previousDbName = $env:DB_NAME
$previousPort = $env:PORT

try {
  Set-Location -LiteralPath $PSScriptRoot

  $env:DB_NAME = $testDatabase
  $env:PORT = $testPort

  if ($env:DB_NAME -ne "anh_nguyet_restore_test_20261106" -or $env:PORT -ne "5011") {
    throw "Không thể khóa cấu hình vào database thử nghiệm và cổng 5011."
  }

  Write-Host "Đang chạy Backend thử nghiệm: database $testDatabase, cổng $testPort."
  Write-Host "Nhấn Ctrl+C để dừng; biến môi trường và thư mục hiện tại sẽ được khôi phục."

  & node .\server.js
} finally {
  if ($null -eq $previousDbName) {
    Remove-Item Env:DB_NAME -ErrorAction SilentlyContinue
  } else {
    $env:DB_NAME = $previousDbName
  }

  if ($null -eq $previousPort) {
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
  } else {
    $env:PORT = $previousPort
  }

  Set-Location -LiteralPath $previousLocation
  Write-Host "Đã khôi phục DB_NAME, PORT và thư mục PowerShell ban đầu."
}
