import requests
import os

SUPABASE_URL = "https://jafexmvuyevnmigxoenp.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphZmV4bXZ1eWV2bm1pZ3hvZW5wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUyMTc0OCwiZXhwIjoyMDg2MDk3NzQ4fQ.z0P1QvpB_JJ1OZfX-6tQi9WqQqA6Ew9jtN9seFB2how"

headers = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

# Use Supabase REST API to execute SQL via the management API
# We'll use the PostgREST RPC endpoint
sql_statements = [
    "ALTER TABLE \"Events\" ADD COLUMN IF NOT EXISTS recurrence_pattern text;",
    "ALTER TABLE \"Events\" ADD COLUMN IF NOT EXISTS recurrence_day_of_week integer;",
    "ALTER TABLE \"Events\" ADD COLUMN IF NOT EXISTS recurrence_end_date date;",
]

# Try using the SQL endpoint
for sql in sql_statements:
    print(f"Executing: {sql}")
    # Use the rpc endpoint to run raw SQL
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
        headers=headers,
        json={"query": sql}
    )
    print(f"  Status: {resp.status_code}, Response: {resp.text[:200] if resp.text else 'empty'}")

# If RPC doesn't work, try via the management API
print("\n--- Trying alternative approach via Supabase Management API ---")

# Check if columns already exist by querying Events table
resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/Events?select=recurrence_pattern&limit=1",
    headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}
)
print(f"Check recurrence_pattern column: Status {resp.status_code}")
if resp.status_code == 200:
    print("  Column already exists!")
else:
    print(f"  Column doesn't exist yet: {resp.text[:200]}")
