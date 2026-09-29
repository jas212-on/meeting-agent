import time
import pytest
import requests


class TestCreateGroupSuccess:
    """Test suite verifying 3 successful group creation scenarios."""

    def test_tc01_standard_group_with_name_and_description(self, backend_url, auth_token):
        """TC_GROUP_SUCC_01: Creates a group with standard name and description."""
        ts = int(time.time() * 1000)
        payload = {
            "name": f"Product Design Team {ts}",
            "description": "Weekly design critiques and roadmap reviews",
        }
        res = requests.post(
            f"{backend_url}/api/groups",
            json=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}"},
            timeout=5,
        )

        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") is True
        assert data.get("message") == "Group created successfully"
        assert data["group"]["name"] == payload["name"]

    def test_tc02_group_with_name_only(self, backend_url, auth_token):
        """TC_GROUP_SUCC_02: Creates a group providing only a name (optional description omitted)."""
        ts = int(time.time() * 1000)
        payload = {
            "name": f"Backend Engineering {ts}",
            "description": "",
        }
        res = requests.post(
            f"{backend_url}/api/groups",
            json=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}"},
            timeout=5,
        )

        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") is True
        assert data.get("message") == "Group created successfully"

    def test_tc03_group_minimum_allowed_name_length(self, backend_url, auth_token):
        """TC_GROUP_SUCC_03: Creates a group with minimum required name length (2 characters)."""
        ts = int(time.time() * 1000)
        payload = {
            "name": f"QA_{str(ts)[-2:]}",  # Valid name of length >= 2
            "description": "Quality assurance squad",
        }
        res = requests.post(
            f"{backend_url}/api/groups",
            json=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}"},
            timeout=5,
        )

        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") is True
        assert data.get("message") == "Group created successfully"
