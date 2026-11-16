# Khởi chạy Backend trong phiên PowerShell hiện tại với database thử nghiệm cố định.
$tenCoSoDuLieuThuNghiem = "anh_nguyet_customer_test_20261109_a"
$congMayChuThuNghiem = "5011"
$viTriBanDau = Get-Location
$tenCSDLTruocDo = $env:DB_NAME
$congTruocDo = $env:PORT

# Lưu thư mục và biến môi trường hiện tại để khôi phục sau khi dừng máy chủ.
try {
  Set-Location -LiteralPath $PSScriptRoot

  $env:DB_NAME = $tenCoSoDuLieuThuNghiem
  $env:PORT = $congMayChuThuNghiem

  if ($env:DB_NAME -ne "anh_nguyet_customer_test_20261109_a" -or $env:PORT -ne "5011") {
    throw "Không thể khóa cấu hình vào database thử nghiệm và cổng 5011."
  }

  Write-Host "Đang chạy Backend thử nghiệm: database $tenCoSoDuLieuThuNghiem, cổng $congMayChuThuNghiem."
  Write-Host "Nhấn Ctrl+C để dừng; biến môi trường và thư mục hiện tại sẽ được khôi phục."

  & node .\server.js
} finally {
  if ($null -eq $tenCSDLTruocDo) {
    Remove-Item Env:DB_NAME -ErrorAction SilentlyContinue
  } else {
    $env:DB_NAME = $tenCSDLTruocDo
  }

  if ($null -eq $congTruocDo) {
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
  } else {
    $env:PORT = $congTruocDo
  }

  Set-Location -LiteralPath $viTriBanDau
  Write-Host "Đã khôi phục DB_NAME, PORT và thư mục PowerShell ban đầu."
}
