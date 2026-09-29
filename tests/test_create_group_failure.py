import pytest
import requests


class TestCreateGroupFailure:
    """Test suite verifying 3 failure/rejection scenarios for group creation."""

    def test_tc01_unsuccessful_empty_group_name(self, backend_url, auth_token):
        """TC_GROUP_FAIL_01: Attempting to create a group with an empty name returns 400 Bad Request."""
        payload = {
            "name": "",
            "description": "Group with empty name",
        }
        res = requests.post(
            f"{backend_url}/api/groups",
            json=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}"},
            timeout=5,
        )

        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") is False
        assert data.get("error") == "Group name is required and must be at least 2 characters long"

    def test_tc02_unsuccessful_single_character_name(self, backend_url, auth_token):
        """TC_GROUP_FAIL_02: Attempting to create a group with only 1 character (<2) returns 400 Bad Request."""
        payload = {
            "name": "X",
            "description": "Group name below minimum length",
        }
        res = requests.post(
            f"{backend_url}/api/groups",
            json=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}"},
            timeout=5,
        )

        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") is False
        assert data.get("error") == "Group name is required and must be at least 2 characters long"

    def test_tc03_unsuccessful_whitespace_only_name(self, backend_url, auth_token):
        """TC_GROUP_FAIL_03: Attempting to create a group with whitespace-only name returns 400 Bad Request."""
        payload = {
            "name": "     ",
            "description": "Group with whitespace-only name",
        }
        res = requests.post(
            f"{backend_url}/api/groups",
            json=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}"},
            timeout=5,
        )

        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") is False
        assert data.get("error") == "Group name is required and must be at least 2 characters long"
