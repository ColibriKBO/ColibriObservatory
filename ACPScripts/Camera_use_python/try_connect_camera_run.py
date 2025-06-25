import subprocess
import time

print("=== Robust Camera Open Loop ===")

while True:
    try:
        result = subprocess.run(
            ["python", "camera_open_try.py"], 
            capture_output=True, text=True, timeout=10
        )

        output = result.stdout.strip()
        print(f"[Subprocess Exit Code: {result.returncode}] Output: {output}")

        if output == "SUCCESS":
            print("Camera opened successfully!")
            break
        else:
            print(f"Camera not opened. Retrying in 3 seconds...")

    except subprocess.TimeoutExpired:
        print("Subprocess timed out (camera hang). Retrying...")

    except Exception as e:
        print(f"Unexpected error: {e}")

    time.sleep(3)

print("Ready to continue with the rest of your main code...")
