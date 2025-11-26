import requests
import os

API_URL = "http://localhost:8000/api"

def test_api():
    print("Testing API...")
    
    # 1. Health Check
    try:
        resp = requests.get("http://localhost:8000/")
        print(f"Root endpoint: {resp.status_code} - {resp.json()}")
    except Exception as e:
        print(f"Failed to connect to backend: {e}")
        return

    # 2. Upload File
    # Create a dummy excel file or use existing one if available
    # For now, let's create a dummy CSV
    dummy_csv = "test_data.csv"
    with open(dummy_csv, "w") as f:
        f.write("Brand;SKU;Nama;Stock;Daily Sales;Max. Daily Sales;Lead Time;Max. Lead Time;Sedang PO;Min. Order;HPP\n")
        f.write("TEST;123;Test Product;10;1;2;5;10;0;5;10000\n")
        
    files = [('files', (dummy_csv, open(dummy_csv, 'rb'), 'text/csv'))]
    
    try:
        print("Uploading file...")
        resp = requests.post(f"{API_URL}/po/upload", files=files)
        print(f"Upload response: {resp.status_code} - {resp.json()}")
    except Exception as e:
        print(f"Upload failed: {e}")
        
    # 3. Process
    try:
        print("Processing...")
        # Create a dummy contribution file
        with open("test_contribution.csv", "w") as f:
            f.write("store,contribution_pct\nPADANG,100\nPEKANBARU,60")
            
        files = {'contribution_file': open('test_contribution.csv', 'rb')}
        resp = requests.post(f"{API_URL}/po/process", files=files)
        
        print(f"Process response: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Processed {len(data.get('data', []))} items")
            print(f"Summary: {data.get('summary')}")
        else:
            print(f"Error details: {resp.text}")
            
        # Clean up
        os.remove("test_contribution.csv")
        
    except Exception as e:
        print(f"Process failed: {e}")

    # Cleanup
    if os.path.exists(dummy_csv):
        os.remove(dummy_csv)

if __name__ == "__main__":
    test_api()
