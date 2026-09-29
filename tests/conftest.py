import time
import pytest
import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager


def pytest_addoption(parser):
    parser.addoption(
        "--frontend-url",
        action="store",
        default="http://localhost:5173",
        help="Base URL for the frontend application",
    )
    parser.addoption(
        "--backend-url",
        action="store",
        default="http://localhost:3001",
        help="Base URL for the backend API",
    )
    parser.addoption(
        "--headed",
        action="store_true",
        default=False,
        help="Run browser in headed mode (default is headless)",
    )


@pytest.fixture(scope="session")
def frontend_url(request):
    return request.config.getoption("--frontend-url")


@pytest.fixture(scope="session")
def backend_url(request):
    return request.config.getoption("--backend-url")


@pytest.fixture(scope="function")
def driver(request):
    headed = request.config.getoption("--headed")

    chrome_options = Options()
    if not headed:
        chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1400,900")

    service = Service(ChromeDriverManager().install())
    web_driver = webdriver.Chrome(service=service, options=chrome_options)
    web_driver.implicitly_wait(3)

    yield web_driver

    try:
        web_driver.quit()
    except Exception:
        pass


@pytest.fixture(scope="function")
def dashboard_page(driver, frontend_url):
    """
    Navigates to the frontend application and ensures the dashboard
    (where the meeting URL input is located) is active.
    If the application presents the auth/welcome screen, clicks 'Continue as Guest'.
    """
    driver.get(frontend_url)
    wait = WebDriverWait(driver, 10)

    # Check if guest continue button is present (initial unauthenticated state)
    guest_buttons = driver.find_elements(By.CLASS_NAME, "guest-continue-btn")
    if guest_buttons:
        guest_buttons[0].click()

    # Wait until the meeting-url input is displayed on the dashboard
    wait.until(EC.visibility_of_element_located((By.ID, "meeting-url")))
    return driver


def enter_meet_url(driver, url_text: str):
    """Helper to clear and type a URL into the meeting URL input."""
    input_elem = driver.find_element(By.ID, "meeting-url")
    input_elem.send_keys(Keys.CONTROL + "a")
    input_elem.send_keys(Keys.BACKSPACE)
    if url_text:
        input_elem.send_keys(url_text)
    time.sleep(0.3)


@pytest.fixture(scope="module")
def auth_token(backend_url):
    """Registers a fresh test user and yields a valid JWT bearer token."""
    ts = int(time.time() * 1000)
    register_payload = {
        "name": f"Test User {ts}",
        "email": f"testuser_{ts}@meetminutes.ai",
        "password": "Password123!",
    }
    res = requests.post(
        f"{backend_url}/api/auth/register",
        json=register_payload,
        headers={"Content-Type": "application/json"},
        timeout=5,
    )
    assert res.status_code == 201, f"Failed to register user for group tests: {res.text}"
    token = res.json().get("token")
    assert token, "JWT token missing from register response"
    return token
