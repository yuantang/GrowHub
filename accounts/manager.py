# -*- coding: utf-8 -*-
"""
Account Manager

Manages multiple accounts for each platform with rotation and cooldown strategies.
"""

import yaml
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict, Any

from .models import Account, AccountStatus


class AccountManager:
    """
    Manages multiple platform accounts with intelligent rotation.
    
    Features:
    - Load/save accounts from YAML config
    - Account rotation (round-robin, least-used)
    - Automatic cooldown after errors
    - Ban detection and recovery
    """

    def __init__(self, config_path: str = "config/accounts.yaml"):
        """
        Initialize account manager
        
        Args:
            config_path: Path to accounts configuration file
        """
        self.config_path = Path(config_path)
        self.accounts: Dict[str, List[Account]] = {}
        self.current_index: Dict[str, int] = {}
        
        self._load_accounts()

    def _load_accounts(self):
        """Load accounts from YAML config file"""
        if not self.config_path.exists():
            self._create_default_config()
            return

        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}

            accounts_data = data.get('accounts', {})
            for platform, account_list in accounts_data.items():
                self.accounts[platform] = []
                for acc_data in account_list:
                    try:
                        account = Account(**acc_data)
                        self.accounts[platform].append(account)
                    except Exception as e:
                        print(f"[AccountManager] Failed to load account: {e}")

                self.current_index[platform] = 0

            print(f"[AccountManager] Loaded {sum(len(a) for a in self.accounts.values())} accounts")

        except Exception as e:
            print(f"[AccountManager] Failed to load config: {e}")
            self._create_default_config()

    def _create_default_config(self):
        """Create default accounts config file"""
        default_config = {
            'accounts': {
                'xhs': [
                    {
                        'name': 'default_xhs_account',
                        'cookies': '',
                        'status': 'disabled',
                        'notes': '请填写有效的Cookie'
                    }
                ],
                'dy': [
                    {
                        'name': 'default_dy_account',
                        'cookies': '',
                        'status': 'disabled',
                        'notes': '请填写有效的Cookie'
                    }
                ]
            }
        }

        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, 'w', encoding='utf-8') as f:
            yaml.dump(default_config, f, allow_unicode=True, default_flow_style=False)

        print(f"[AccountManager] Created default config at {self.config_path}")

    def save_accounts(self):
        """Save current accounts state to config file"""
        data = {'accounts': {}}
        
        for platform, accounts in self.accounts.items():
            data['accounts'][platform] = [
                {
                    'id': acc.id,
                    'name': acc.name,
                    'cookies': acc.cookies,
                    'status': acc.status.value,
                    'notes': acc.notes,
                    'request_count': acc.request_count,
                    'success_count': acc.success_count,
                    'error_count': acc.error_count,
                }
                for acc in accounts
            ]

        with open(self.config_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False)

    def get_available_accounts(self, platform: str) -> List[Account]:
        """Get all available accounts for a platform"""
        accounts = self.accounts.get(platform, [])
        return [acc for acc in accounts if acc.is_available()]

    def get_account(self, platform: str, strategy: str = "round-robin") -> Optional[Account]:
        """
        Get an available account for the platform
        
        Args:
            platform: Platform identifier
            strategy: Selection strategy (round-robin, least-used, random)
            
        Returns:
            Account or None if no available account
        """
        available = self.get_available_accounts(platform)
        if not available:
            return None

        if strategy == "round-robin":
            idx = self.current_index.get(platform, 0) % len(available)
            self.current_index[platform] = (idx + 1) % len(available)
            return available[idx]
        
        elif strategy == "least-used":
            return min(available, key=lambda a: a.request_count)
        
        elif strategy == "random":
            import random
            return random.choice(available)
        
        else:
            return available[0]

    def use_account(self, account: Account) -> None:
        """Mark an account as used"""
        account.use()

    def record_success(self, account: Account) -> None:
        """Record a successful request for an account"""
        account.record_success()

    def record_error(self, account: Account, error_type: str = "unknown") -> None:
        """
        Record an error for an account
        
        Args:
            account: The account that encountered an error
            error_type: Type of error (rate_limit, banned, network, etc.)
        """
        account.record_error()

        if error_type == "rate_limit":
            # Put account in cooldown
            account.mark_cooling(seconds=300)  # 5 minutes
            print(f"[AccountManager] Account {account.name} in cooldown due to rate limit")
        
        elif error_type == "banned":
            # Mark account as banned
            account.mark_banned(hours=24)
            print(f"[AccountManager] Account {account.name} marked as banned")
        
        elif error_type == "expired":
            # Mark account cookies as expired
            account.status = AccountStatus.EXPIRED
            print(f"[AccountManager] Account {account.name} cookies expired")

    def rotate_on_error(self, platform: str, current_account: Account) -> Optional[Account]:
        """
        Rotate to a different account after encountering an error
        
        Args:
            platform: Platform identifier
            current_account: The account that failed
            
        Returns:
            New account or None if no alternative available
        """
        # Put current account in cooldown
        current_account.mark_cooling(seconds=60)
        
        # Try to get another account
        available = self.get_available_accounts(platform)
        if not available:
            return None
        
        # Prefer accounts with lower error rates
        return min(available, key=lambda a: a.error_count / max(a.request_count, 1))

    def add_account(self, platform: str, name: str, cookies: str, notes: str = "") -> Account:
        """
        Add a new account
        
        Args:
            platform: Platform identifier
            name: Display name
            cookies: Cookie string
            notes: Optional notes
            
        Returns:
            The created account
        """
        account = Account(
            platform=platform,
            name=name,
            cookies=cookies,
            notes=notes
        )

        if platform not in self.accounts:
            self.accounts[platform] = []
            self.current_index[platform] = 0

        self.accounts[platform].append(account)
        self.save_accounts()

        return account

    def remove_account(self, platform: str, account_id: str) -> bool:
        """
        Remove an account
        
        Args:
            platform: Platform identifier
            account_id: Account ID to remove
            
        Returns:
            True if removed, False if not found
        """
        if platform not in self.accounts:
            return False

        original_len = len(self.accounts[platform])
        self.accounts[platform] = [
            acc for acc in self.accounts[platform]
            if acc.id != account_id
        ]

        if len(self.accounts[platform]) < original_len:
            self.save_accounts()
            return True
        
        return False

    def update_account(self, platform: str, account_id: str, **updates) -> Optional[Account]:
        """
        Update an account's properties
        
        Args:
            platform: Platform identifier
            account_id: Account ID to update
            **updates: Fields to update
            
        Returns:
            Updated account or None if not found
        """
        for acc in self.accounts.get(platform, []):
            if acc.id == account_id:
                for key, value in updates.items():
                    if hasattr(acc, key):
                        setattr(acc, key, value)
                self.save_accounts()
                return acc
        
        return None

    def get_account_by_id(self, platform: str, account_id: str) -> Optional[Account]:
        """Get a specific account by ID"""
        for acc in self.accounts.get(platform, []):
            if acc.id == account_id:
                return acc
        return None

    def get_all_accounts(self, platform: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get all accounts (for API/display)
        
        Args:
            platform: Optional platform filter
            
        Returns:
            Dictionary of platform -> account summaries
        """
        result = {}
        
        for plat, accounts in self.accounts.items():
            if platform and plat != platform:
                continue
            result[plat] = [acc.to_summary() for acc in accounts]
        
        return result

    def get_stats(self) -> Dict[str, Any]:
        """Get account manager statistics"""
        total_accounts = sum(len(a) for a in self.accounts.values())
        total_active = sum(
            len([acc for acc in accounts if acc.is_available()])
            for accounts in self.accounts.values()
        )

        return {
            "total_accounts": total_accounts,
            "active_accounts": total_active,
            "platforms": {
                platform: {
                    "total": len(accounts),
                    "active": len([a for a in accounts if a.is_available()]),
                    "total_requests": sum(a.request_count for a in accounts),
                }
                for platform, accounts in self.accounts.items()
            }
        }


# Global singleton instance
_account_manager: Optional[AccountManager] = None


def get_account_manager() -> AccountManager:
    """Get the global account manager instance"""
    global _account_manager
    if _account_manager is None:
        _account_manager = AccountManager()
    return _account_manager
