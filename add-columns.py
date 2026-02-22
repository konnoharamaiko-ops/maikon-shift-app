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

# Use Supabase REST API to execute SQL via the pg_net extension or rpc
# Actually, we'll use the Supabase Management API or direct SQL

# Let's try adding columns via direct SQL using the REST API's rpc endpoint
sql_statements = [
    # Add additional_times JSONB column to ShiftRequest table
    "ALTER TABLE \"ShiftRequest\" ADD COLUMN IF NOT EXISTS additional_times jsonb DEFAULT '[]'::jsonb;",
    # Add additional_times JSONB column to WorkShift table
    "ALTER TABLE \"WorkShift\" ADD COLUMN IF NOT EXISTS additional_times jsonb DEFAULT '[]'::jsonb;",
    # Add work_details JSONB column to WorkShift table
    "ALTER TABLE \"WorkShift\" ADD COLUMN IF NOT EXISTS work_details jsonb DEFAULT '[]'::jsonb;",
]

# Try using the Supabase SQL endpoint
for sql in sql_statements:
    print(f"Executing: {sql}")
    # Use the pg REST endpoint
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
        headers=headers,
        json={"query": sql}
    )
    print(f"  Status: {resp.status_code}, Response: {resp.text[:200]}")

# If rpc doesn't work, try via the management API
print("\n--- Trying alternative approach: test if columns exist by querying ---")

# Test ShiftRequest
resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/ShiftRequest?select=additional_times&limit=1",
    headers=headers
)
print(f"ShiftRequest.additional_times: {resp.status_code} - {resp.text[:200]}")

# Test WorkShift
resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/WorkShift?select=additional_times,work_details&limit=1",
    headers=headers
)
print(f"WorkShift.additional_times,work_details: {resp.status_code} - {resp.text[:200]}")
