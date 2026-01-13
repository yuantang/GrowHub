# GrowHub Project Structure & Data Flow

## 1. System Architecture Overview

GrowHub consists of three main layers:
1.  **Web Client (Frontend)**: React-based dashboard for user interaction.
2.  **API Server (Backend)**: FastAPI application handling business logic, data management, and crawler orchestration.
3.  **Crawler Engine (MediaCrawler)**: An independent, powerful crawler module based on Playwright/DrissionPage.

## 2. Module Responsibilities

### 2.1 Web Client (`web-client/`)
*   **Pages**:
    *   `ProjectsPage`: List and manage monitoring projects.
    *   `ProjectDetailPage`: View project stats, execution logs, and **crawled content data**.
    *   `AccountPoolPage`: Manage platform accounts (Cookie/QR Login).
*   **Responsibilities**: Display data, send user commands to API.

### 2.2 API Server (`api/`)
*   **`main.py`**: Entry point.
*   **`routers/`**: HTTP API endpoints.
    *   `growhub_projects.py`: Project management APIs.
    *   `growhub_account_pool.py`: Account management APIs.
*   **`services/`**: Business logic.
    *   **`project.py` (`ProjectService`)**: The "Brain". Manages project lifecycles, schedules tasks, and coordinates execution.
    *   **`account_pool.py` (`AccountPoolService`)**: The "Wallet". Stores and validates platform accounts/cookies.
    *   **`crawler_manager.py`**: The "Driver". Launches and monitors the `MediaCrawler` subprocess.
    *   **`growhub_store.py` (`GrowHubStoreService`)**: The "Archivist". Receives raw data from crawlers, normalizes it, and saves it to the unified database.

### 2.3 Crawler Engine (`MediaCrawler/`)
*   This is an external module (forked/integrated).
*   **Responsibilities**: actively interacting with platform web pages (Little Red Book, Douyin, etc.) to fetch data.
*   **Data Flow**: Crawler runs -> Saves data to its own `sqlite` -> `GrowHub` reads/receives this data.

### 2.4 Database (`database/`)
*   **`growhub.db`**: The central SQLite database.
    *   **`growhub_projects`**: User's project configurations.
    *   **`growhub_accounts`**: Account pool data.
    *   **`growhub_contents`**: **Critical Table**. Stores all crawled data in a unified format (Author, Title, Content, Metrics). This is where the "Public Opinion" data lives.

## 3. Data Flow: From Task to Display

1.  **Trigger**: User clicks "Run" or Schedule triggers a task.
2.  **Preparation**:
    *   `ProjectService` gets configuration (Keywords).
    *   `AccountPoolService` provides valid Cookies.
3.  **Execution**:
    *   `CrawlerManager` launches `MediaCrawler` command.
    *   `MediaCrawler` visits websites, scrapes data.
4.  **Storage (The "Black Box" user asked about)**:
    *   Raw data is temporarily stored by MediaCrawler.
    *   **Crucial Step**: `GrowHubStoreService` detects new data and **syncs** it into `growhub_contents` table.
5.  **Display**:
    *   User views "Project Detail" -> "Content List" tab.
    *   Frontend requests `GET /projects/{id}/contents`.
    *   Backend queries `growhub_contents` filtered by project keywords.
    *   Data is shown in the table (Author, Content, Interaction, etc.).

## 4. Key Data Locations

*   **Project Config**: `growhub_projects` table.
*   **Crawled Content**: `growhub_contents` table.
*   **Execution Logs**: Stored in memory (per session) and `MediaCrawler` logs.

## 5. Recent Improvements (Current Session)

*   **Robustness**: Fixed `TypeError` issues by filtering invalid data fields before storage.
*   **Persistence**: Account pool now persist in DB.
*   **Visualization**: Added "Content Data" tab in Project Detail to view collected public opinion data.
