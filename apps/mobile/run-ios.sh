#!/bin/bash
set -e

echo "🚀 Edu Mobile - iOS Simulator Launch Script"
echo "============================================"

# Navigate to mobile app directory
cd "$(dirname "$0")"

# Check Flutter is installed
if ! command -v flutter &> /dev/null; then
  echo "❌ Flutter not found. Install it from https://docs.flutter.dev/get-started/install"
  exit 1
fi

# Boot iOS Simulator if not already running
if ! pgrep -x "Simulator" > /dev/null; then
  echo "📱 Booting iOS Simulator..."
  open -a Simulator
  sleep 3
fi

# Install dependencies
echo "📦 Installing dependencies..."
flutter pub get

# Run code generation
echo "⚙️  Running code generation..."
dart run build_runner build --delete-conflicting-outputs

# Install CocoaPods
echo "🍫 Installing CocoaPods..."
cd ios && pod install --repo-update && cd ..

# Run on iOS simulator
echo "🏃 Launching app on iOS Simulator..."
flutter run --debug
