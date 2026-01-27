
import sys
import os

# Add project root to path
sys.path.append(os.getcwd())

from api.auth.security import get_password_hash, verify_password

def test_long_password():
    print("Testing long password handling...")
    
    # 1. Create a password > 72 bytes
    # "测试" is 6 bytes. 20 times is 120 bytes.
    long_password = "测试此密码长度是否超过限制" * 10  # 12 chars * 3 bytes = 36 bytes * 10 = 360 bytes
    
    print(f"Password length (chars): {len(long_password)}")
    print(f"Password length (bytes): {len(long_password.encode('utf-8'))}")
    
    try:
        # 2. Try to hash it
        print("Attempting to hash...")
        hashed = get_password_hash(long_password)
        print(f"Hash success: {hashed[:10]}...")
        
        # 3. Try to verify it
        print("Attempting to verify...")
        is_valid = verify_password(long_password, hashed)
        print(f"Verify result: {is_valid}")
        
        if is_valid:
            print("✅ TEST PASSED: Long password handled correctly")
        else:
            print("❌ TEST FAILED: Verification returned False")

    except Exception as e:
        print(f"❌ TEST FAILED with Exception: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

def test_short_password():
    print("\nTesting short password handling...")
    short_password = "password123"
    
    try:
        hashed = get_password_hash(short_password)
        is_valid = verify_password(short_password, hashed)
        
        if is_valid:
            print("✅ TEST PASSED: Short password handled correctly")
        else:
            print("❌ TEST FAILED: Short password verification returned False")
    except Exception as e:
        print(f"❌ TEST FAILED with Exception: {e}")

if __name__ == "__main__":
    test_long_password()
    test_short_password()
