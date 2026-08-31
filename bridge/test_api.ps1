Write-Host "Testing /health"
$health = Invoke-RestMethod -Uri "http://127.0.0.1:3005/health" -Method Get
Write-Host ($health | ConvertTo-Json)

# pick-file opens a dialog so I won't fully automate it in this script.
# I will just ensure health works to prove the server is up.
