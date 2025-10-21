#!/usr/bin/env python3
"""Manual test script for the Product Description Platform API."""

import json
import os
from typing import Optional

import requests


BASE_URL = "http://localhost:8000"
HAS_WRITER_KEY = bool(os.getenv("WRITER_API_KEY"))


def test_health_check() -> bool:
    print("Testing health check...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as exc:
        print(f"Error: {exc}")
        return False


def test_api_info() -> bool:
    print("\nTesting API info...")
    try:
        response = requests.get(f"{BASE_URL}/api/info", timeout=10)
        print(f"Status: {response.status_code}")
        print(json.dumps(response.json(), indent=2))
        return response.status_code == 200
    except Exception as exc:
        print(f"Error: {exc}")
        return False


def test_product_crud() -> bool:
    print("\nTesting product CRUD workflow...")
    try:
        create_payload = {
            "name": "AuroraGlow Smart Lamp",
            "category": "Home Lighting",
            "brand": "Aurora",
            "features": [
                "Adaptive brightness and color temperature",
                "Voice assistant integration",
                "Energy-saving LED core",
            ],
            "seo_keywords": ["smart lamp", "voice control lighting", "ambient LED"],
            "tone": "inspiring",
            "audience": "Design-conscious homeowners",
            "length": "standard",
            "description": "AuroraGlow Smart Lamp bathes every room in customizable light, responding to your routine and mood.",
            "auto_generate": False,
        }

        create_response = requests.post(
            f"{BASE_URL}/api/products",
            json=create_payload,
            timeout=20,
        )
        print(f"Create status: {create_response.status_code}")
        if create_response.status_code != 201:
            print(f"Error: {create_response.text}")
            return False

        product = create_response.json()
        product_id = product["id"]

        list_response = requests.get(f"{BASE_URL}/api/products", timeout=10)
        print(f"List status: {list_response.status_code}")
        if list_response.status_code != 200:
            return False
        ids = [item["id"] for item in list_response.json()]
        if product_id not in ids:
            print("Created product not found in list response")
            return False

        update_payload = {
            "tone": "luxurious",
            "description": "AuroraGlow Smart Lamp transforms your living space with responsive, ambient lighting and polished design.",
        }
        update_response = requests.put(
            f"{BASE_URL}/api/products/{product_id}",
            json=update_payload,
            timeout=20,
        )
        print(f"Update status: {update_response.status_code}")
        if update_response.status_code != 200:
            print(f"Error: {update_response.text}")
            return False

        delete_response = requests.delete(
            f"{BASE_URL}/api/products/{product_id}",
            timeout=10,
        )
        print(f"Delete status: {delete_response.status_code}")
        if delete_response.status_code != 204:
            print(f"Error: {delete_response.text}")
            return False

        return True
    except Exception as exc:
        print(f"Error: {exc}")
        return False


def test_generation_endpoint() -> Optional[bool]:
    if not HAS_WRITER_KEY:
        print("\nSkipping generation test (WRITER_API_KEY not configured).")
        return None

    print("\nTesting description generation endpoint...")
    payload = {
        "name": "Nimbus Air Purifier",
        "category": "Home Appliances",
        "features": [
            "HEPA H13 filtration",
            "Real-time air quality monitoring",
            "Quiet night mode",
        ],
        "tone": "reassuring",
        "audience": "Families with allergies",
        "length": "detailed",
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/products/generate",
            json=payload,
            timeout=30,
        )
        print(f"Generation status: {response.status_code}")
        if response.status_code != 200:
            print(f"Error: {response.text}")
            return False
        description = response.json().get("description", "").strip()
        print(f"Generated description preview: {description[:160]}...")
        return bool(description)
    except Exception as exc:
        print(f"Error: {exc}")
        return False


def main() -> None:
    print("=== Product Description Platform API Tests ===\n")

    tests = [
        ("Health Check", test_health_check),
        ("API Info", test_api_info),
        ("Product CRUD", test_product_crud),
    ]

    results = []
    for name, func in tests:
        print(f"\n{'=' * 50}")
        result = func()
        results.append((name, result))
        print(f"{'=' * 50}")

    generation_result = test_generation_endpoint()
    if generation_result is not None:
        results.append(("Generation Endpoint", generation_result))

    print(f"\n{'=' * 50}")
    print("TEST RESULTS SUMMARY:")
    print(f"{'=' * 50}")

    overall_pass = True
    for name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{name}: {status}")
        overall_pass = overall_pass and result

    if generation_result is None:
        print("Generation Endpoint: ⚠️ SKIPPED (missing WRITER_API_KEY)")

    print(f"\nOverall: {'✅ ALL TESTS PASSED' if overall_pass else '❌ SOME TESTS FAILED'}")


if __name__ == "__main__":
    main()