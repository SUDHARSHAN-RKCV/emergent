"""Backend tests for Ledger app - auth, RBAC, accounts/categories/transactions, analytics, MFA, currency."""
import os
import pytest
import requests
import pyotp
from datetime import datetime

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://expense-insight-84.preview.emergentagent.com").rstrip("/")
OWNER_TOK = "test_session_owner_123"
EDITOR_TOK = "test_session_editor_123"
VIEWER_TOK = "test_session_viewer_123"

def H(tok=None):
    h = {"Content-Type": "application/json"}
    if tok: h["Authorization"] = f"Bearer {tok}"
    return h

# ---------------- Auth ----------------
def test_me_unauth():
    r = requests.get(f"{BASE}/api/auth/me")
    assert r.status_code == 401

def test_me_owner():
    r = requests.get(f"{BASE}/api/auth/me", headers=H(OWNER_TOK))
    assert r.status_code == 200
    d = r.json()
    assert d["user_id"] == "test-user-owner"
    assert d["role"] == "owner"

# ---------------- RBAC users ----------------
def test_users_list_owner_only():
    assert requests.get(f"{BASE}/api/users", headers=H(EDITOR_TOK)).status_code == 403
    assert requests.get(f"{BASE}/api/users", headers=H(VIEWER_TOK)).status_code == 403
    r = requests.get(f"{BASE}/api/users", headers=H(OWNER_TOK))
    assert r.status_code == 200
    assert isinstance(r.json(), list)

def test_viewer_forbidden_writes():
    payload = {"name": "TEST_v", "type": "bank", "currency": "INR", "opening_balance": 0}
    r = requests.post(f"{BASE}/api/accounts", json=payload, headers=H(VIEWER_TOK))
    assert r.status_code == 403
    # viewer can GET
    assert requests.get(f"{BASE}/api/accounts", headers=H(VIEWER_TOK)).status_code == 200
    assert requests.get(f"{BASE}/api/categories", headers=H(VIEWER_TOK)).status_code == 200
    assert requests.get(f"{BASE}/api/transactions", headers=H(VIEWER_TOK)).status_code == 200

# ---------------- Accounts ----------------
@pytest.fixture(scope="module")
def account_id():
    r = requests.post(f"{BASE}/api/accounts",
        json={"name": "TEST_Bank", "type": "bank", "currency": "INR", "opening_balance": 1000.0},
        headers=H(OWNER_TOK))
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    yield aid
    requests.delete(f"{BASE}/api/accounts/{aid}", headers=H(OWNER_TOK))

def test_account_list_has_balance(account_id):
    r = requests.get(f"{BASE}/api/accounts", headers=H(OWNER_TOK))
    assert r.status_code == 200
    accs = r.json()
    found = [a for a in accs if a["id"] == account_id]
    assert found and "current_balance" in found[0]
    assert found[0]["current_balance"] == 1000.0

def test_editor_can_create_account():
    r = requests.post(f"{BASE}/api/accounts",
        json={"name": "TEST_EditorAcc", "type": "wallet", "currency": "INR", "opening_balance": 0},
        headers=H(EDITOR_TOK))
    assert r.status_code == 200
    requests.delete(f"{BASE}/api/accounts/{r.json()['id']}", headers=H(EDITOR_TOK))

# ---------------- Categories ----------------
@pytest.fixture(scope="module")
def cat_ids():
    e = requests.post(f"{BASE}/api/categories", json={"name": "TEST_Food", "kind": "expense"}, headers=H(OWNER_TOK))
    i = requests.post(f"{BASE}/api/categories", json={"name": "TEST_Bonus", "kind": "income"}, headers=H(OWNER_TOK))
    assert e.status_code == 200 and i.status_code == 200
    eid, iid = e.json()["id"], i.json()["id"]
    yield eid, iid
    requests.delete(f"{BASE}/api/categories/{eid}", headers=H(OWNER_TOK))
    requests.delete(f"{BASE}/api/categories/{iid}", headers=H(OWNER_TOK))

def test_categories_list(cat_ids):
    r = requests.get(f"{BASE}/api/categories", headers=H(OWNER_TOK))
    assert r.status_code == 200
    names = [c["name"] for c in r.json()]
    assert "TEST_Food" in names and "TEST_Bonus" in names

# ---------------- Transactions ----------------
@pytest.fixture(scope="module")
def txn_ids(account_id, cat_ids):
    eid, iid = cat_ids
    today = datetime.utcnow().strftime("%Y-%m-%d")
    exp = requests.post(f"{BASE}/api/transactions", json={
        "type": "expense", "name": "TEST_Milk", "date": today,
        "unit_price": 50.0, "quantity": 2, "billed_amount": 100.0,
        "category_id": eid, "account_id": account_id,
        "is_recurrent": True, "recurrence_period": "monthly"
    }, headers=H(OWNER_TOK))
    inc = requests.post(f"{BASE}/api/transactions", json={
        "type": "income", "name": "TEST_Salary", "date": today,
        "unit_price": 5000.0, "quantity": 1, "billed_amount": 5000.0,
        "category_id": iid, "account_id": account_id
    }, headers=H(OWNER_TOK))
    assert exp.status_code == 200, exp.text
    assert inc.status_code == 200, inc.text
    # Add second data point for unit-price drift
    requests.post(f"{BASE}/api/transactions", json={
        "type": "expense", "name": "TEST_Milk", "date": today,
        "unit_price": 55.0, "quantity": 1, "billed_amount": 55.0,
        "category_id": eid, "account_id": account_id
    }, headers=H(OWNER_TOK))
    yield exp.json()["id"], inc.json()["id"]
    # cleanup all TEST_ txns
    txns = requests.get(f"{BASE}/api/transactions", headers=H(OWNER_TOK)).json()
    for t in txns:
        if t["name"].startswith("TEST_"):
            requests.delete(f"{BASE}/api/transactions/{t['id']}", headers=H(OWNER_TOK))

def test_txn_created_with_recurrent(txn_ids):
    txns = requests.get(f"{BASE}/api/transactions", headers=H(OWNER_TOK)).json()
    milk = [t for t in txns if t["name"] == "TEST_Milk" and t.get("is_recurrent")]
    assert milk and milk[0]["recurrence_period"] == "monthly"

def test_viewer_cannot_create_txn(account_id, cat_ids):
    eid, _ = cat_ids
    today = datetime.utcnow().strftime("%Y-%m-%d")
    r = requests.post(f"{BASE}/api/transactions", json={
        "type": "expense", "name": "TEST_X", "date": today,
        "unit_price": 1, "quantity": 1, "billed_amount": 1,
        "category_id": eid, "account_id": account_id
    }, headers=H(VIEWER_TOK))
    assert r.status_code == 403

# ---------------- Analytics ----------------
def test_analytics_summary(txn_ids):
    r = requests.get(f"{BASE}/api/analytics/summary", headers=H(OWNER_TOK))
    assert r.status_code == 200
    d = r.json()
    for k in ["month_income", "month_expense", "total_balance", "recurring_monthly"]:
        assert k in d
    assert d["month_income"] >= 5000
    assert d["recurring_monthly"] >= 100

def test_analytics_trends():
    r = requests.get(f"{BASE}/api/analytics/trends?months=6", headers=H(OWNER_TOK))
    assert r.status_code == 200 and isinstance(r.json(), list)

def test_analytics_category_breakdown():
    r = requests.get(f"{BASE}/api/analytics/category-breakdown?type=expense", headers=H(OWNER_TOK))
    assert r.status_code == 200 and isinstance(r.json(), list)

def test_analytics_unit_prices(txn_ids):
    r = requests.get(f"{BASE}/api/analytics/unit-prices", headers=H(OWNER_TOK))
    assert r.status_code == 200
    items = r.json()
    milk = [x for x in items if x["name"] == "TEST_Milk"]
    assert milk and len(milk[0]["points"]) >= 2

def test_analytics_recurring(txn_ids):
    r = requests.get(f"{BASE}/api/analytics/recurring", headers=H(OWNER_TOK))
    assert r.status_code == 200
    assert any(t["name"] == "TEST_Milk" for t in r.json())

# ---------------- Currency ----------------
def test_update_currency():
    r = requests.put(f"{BASE}/api/me/currency", json={"currency": "USD"}, headers=H(OWNER_TOK))
    assert r.status_code == 200
    assert r.json()["preferred_currency"] == "USD"
    # revert
    requests.put(f"{BASE}/api/me/currency", json={"currency": "INR"}, headers=H(OWNER_TOK))

# ---------------- MFA ----------------
def test_mfa_setup_and_enable_disable():
    # use a dedicated user to avoid affecting owner session
    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    dbn = os.environ.get("DB_NAME", "test_database")
    d = mc[dbn]
    d.users.update_one({"user_id": "test-mfa-user"}, {"$set": {
        "user_id": "test-mfa-user", "email": "mfa@test.com", "name": "MFA",
        "role": "owner", "mfa_enabled": False, "mfa_secret": None,
        "preferred_currency": "INR", "created_at": datetime.utcnow()}}, upsert=True)
    from datetime import timedelta
    d.user_sessions.update_one({"session_token": "test_session_mfa_123"}, {"$set": {
        "user_id": "test-mfa-user", "session_token": "test_session_mfa_123",
        "mfa_verified": True, "expires_at": datetime.utcnow() + timedelta(days=7),
        "created_at": datetime.utcnow()}}, upsert=True)

    r = requests.post(f"{BASE}/api/mfa/setup", headers=H("test_session_mfa_123"))
    assert r.status_code == 200, r.text
    setup = r.json()
    assert "secret" in setup and "qr_code_data_uri" in setup
    secret = setup["secret"]
    code = pyotp.TOTP(secret).now()
    en = requests.post(f"{BASE}/api/mfa/enable", json={"code": code}, headers=H("test_session_mfa_123"))
    assert en.status_code == 200
    # now disable with valid code
    code2 = pyotp.TOTP(secret).now()
    dis = requests.post(f"{BASE}/api/mfa/disable", json={"code": code2}, headers=H("test_session_mfa_123"))
    assert dis.status_code == 200
    # invalid code
    bad = requests.post(f"{BASE}/api/mfa/disable", json={"code": "000000"}, headers=H("test_session_mfa_123"))
    assert bad.status_code in (400,)
    # cleanup
    d.users.delete_one({"user_id": "test-mfa-user"})
    d.user_sessions.delete_one({"session_token": "test_session_mfa_123"})
